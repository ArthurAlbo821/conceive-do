/**
 * JOBLYA V4 - AI Auto-Reply Edge Function
 *
 * Main orchestrator that coordinates all modules:
 * - Authentication & authorization
 * - Data fetching (user, conversation, appointments)
 * - Temporal parsing (Duckling + Chrono fallback)
 * - Availability calculation
 * - AI mode determination (WORKFLOW vs WAITING)
 * - OpenAI API calls
 * - Appointment creation & validation
 * - WhatsApp messaging
 * - Event logging
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

// Environment validation (must be first!)
import { validateEnv } from './config/env.ts';

// Validate environment variables at startup
const env = validateEnv();

// Config
import { AI_MODES, APPOINTMENT_STATUS, getCorsHeaders } from './config.ts';

// Security
import { validateJWT, authErrorResponse } from './security/auth.ts';
import { checkRateLimit, rateLimitErrorResponse, cleanupOldRateLimits } from './security/ratelimit.ts';

// Utils
import { toFranceTime, toFranceISODate } from './utils/timezone.ts';
import { buildDynamicEnums } from './utils/enums.ts';
import { buildPriceMappings } from './utils/pricing.ts';

// Temporal
import { parseAndEnrichMessage } from './temporal/parser.ts';

// Data
import { fetchAllUserData } from './data/user.ts';
import { fetchAllConversationData, getConversationContactPhone } from './data/conversation.ts';
import { buildUserContext, buildCurrentDateTime, formatAvailabilitiesForPrompt } from './data/context.ts';

// Availability
import { computeAvailableRanges } from './availability/calculator.ts';
import { validateAppointmentTimeDetailed } from './availability/validator.ts';

// AI
import { determineAIMode, getAIModeDescription } from './ai/modes.ts';
import { buildWaitingPrompt } from './ai/prompts/waiting.ts';
import { buildWorkflowPrompt } from './ai/prompts/workflow.ts';
import { executeOpenAIRequest } from './ai/openai.ts';

// Appointment
import { buildAppointmentTool } from './appointments/tool.ts';
import { validateAppointmentComplete } from './appointments/validation.ts';
import { createAppointment } from './appointments/creation.ts';
import { buildConfirmationMessage } from './appointments/confirmation.ts';

// Messaging
import { sendWhatsAppMessageWithRetry } from './messaging/whatsapp.ts';

// Logging
import { 
  logTemporalParsing, 
  logOpenAICall, 
  logAppointmentCreation,
  logValidationError,
  logArrivalDetection,
  logError
} from './logging/events.ts';

/**
 * Main request handler
 */
Deno.serve(async (request) => {
  console.log('\n=== 🚀 JOBLYA V4 - AI Auto-Reply Request ===');
  console.log('[main] Request received at:', new Date().toISOString());

  // Get CORS headers based on request origin
  const requestOrigin = request.headers.get('Origin');
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    console.log('[cors] Handling preflight request from origin:', requestOrigin);
    return new Response(null, { 
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400' // 24 hours
      }
    });
  }

  // Store parsed request body for reuse in error handling
  let requestBody: any = null;

  try {
    // ========================================
    // 1. AUTHENTICATION
    // ========================================
    console.log('\n[1/12] 🔐 Authentication...');

    const authHeader = request.headers.get('Authorization');
    let user_id: string;

    // Detect if this is an internal call from another Edge Function (service role key)
    // or an external call from the frontend (user JWT)
    if (authHeader && authHeader.includes(env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20))) {
      // Internal call: extract user_id from request body
      console.log('[auth] 🔧 Internal call detected (service role key)');

      requestBody = await request.json();
      user_id = requestBody.user_id;

      if (!user_id) {
        console.error('[auth] Internal call missing user_id in body');
        return new Response(
          JSON.stringify({ error: 'Missing user_id in request body for internal call' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[auth] ✅ Internal call authenticated for user:', user_id);
    } else {
      // External call: validate JWT as usual
      console.log('[auth] 🔑 External call detected, validating JWT...');

      const auth = await validateJWT(authHeader, env.JWT_SECRET);

      if (!auth.isValid) {
        console.error('[auth] Authentication failed:', auth.error);
        return authErrorResponse(auth.error!, corsHeaders);
      }

      user_id = auth.user_id!;
      console.log('[auth] ✅ JWT authenticated for user:', user_id);
    }

    // ========================================
    // 2. PARSE REQUEST BODY
    // ========================================
    console.log('\n[2/12] 📦 Parse request body...');

    // If not already parsed (external call), parse now
    if (!requestBody) {
      requestBody = await request.json();
    }

    const { conversation_id, message_text } = requestBody;
    
    if (!conversation_id || !message_text) {
      console.error('[main] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing conversation_id or message_text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[main] ✅ Conversation:', conversation_id);
    console.log('[main] ✅ Message:', message_text.substring(0, 100) + '...');

    // ========================================
    // 3. INITIALIZE SUPABASE CLIENT
    // ========================================
    console.log('\n[3/12] 🗄️  Initialize Supabase...');

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('[supabase] ✅ Client initialized');

    // ========================================
    // 4. RATE LIMITING CHECK
    // ========================================
    console.log('\n[4/12] 🚦 Check rate limit...');

    const rateLimit = await checkRateLimit(supabase, user_id);

    if (!rateLimit.isAllowed) {
      console.error('[ratelimit] ❌ Rate limit exceeded');
      return rateLimitErrorResponse(rateLimit.error!, rateLimit.resetTime, corsHeaders);
    }

    console.log('[ratelimit] ✅ Request allowed');

    // Cleanup old rate limit records (async, no await)
    cleanupOldRateLimits(supabase).catch(err =>
      console.error('[ratelimit] Cleanup failed:', err)
    );

    // ========================================
    // 5. FETCH USER & CONVERSATION DATA
    // ========================================
    console.log('\n[5/12] 📊 Fetch data...');
    
    const [userData, conversationData] = await Promise.all([
      fetchAllUserData(supabase, user_id),
      fetchAllConversationData(supabase, conversation_id)
    ]);
    
    const { userInfo, availabilities, appointments } = userData;
    const { messages, todayAppointment } = conversationData;
    
    console.log('[data] ✅ User info loaded');
    console.log('[data] ✅', availabilities.length, 'availabilities,', appointments.length, 'appointments');
    console.log('[data] ✅', messages.length, 'messages loaded');
    console.log('[data] ✅ Today appointment:', todayAppointment ? 'YES' : 'NO');

    // ========================================
    // 5. TEMPORAL PARSING
    // ========================================
    console.log('\n[6/12] ⏰ Temporal parsing...');
    
    const now = toFranceTime(new Date());
    const { entities, enrichedMessage, parsingMethod } = await parseAndEnrichMessage(message_text, now);
    
    console.log('[temporal] ✅', entities.length, 'entities found via', parsingMethod);
    
    if (entities.length > 0) {
      await logTemporalParsing(
        supabase, user_id, conversation_id,
        message_text, enrichedMessage, entities.length, parsingMethod
      );
    }

    // ========================================
    // 6. BUILD CONTEXTS
    // ========================================
    console.log('\n[7/12] 🏗️  Build contexts...');
    
    const userContext = buildUserContext(userInfo);
    const currentDateTime = buildCurrentDateTime(now);
    const availableRanges = computeAvailableRanges(availabilities, appointments, now);
    
    console.log('[context] ✅ User context built');
    console.log('[context] ✅ Current:', currentDateTime.fullDate, currentDateTime.time);
    console.log('[context] ✅ Available ranges:', availableRanges);

    // ========================================
    // 7. DETERMINE AI MODE
    // ========================================
    console.log('\n[8/12] 🤖 Determine AI mode...');
    
    const aiMode = determineAIMode(todayAppointment);
    console.log('[ai] ✅ Mode:', getAIModeDescription(todayAppointment));

    // ========================================
    // 8. BUILD SYSTEM PROMPT
    // ========================================
    console.log('\n[9/12] 📝 Build system prompt...');
    
    let systemPrompt: string;
    let appointmentTool;
    
    if (aiMode === AI_MODES.WAITING) {
      // WAITING mode: JSON structured output
      systemPrompt = buildWaitingPrompt(todayAppointment!, currentDateTime);
      console.log('[prompt] ✅ WAITING prompt built (', systemPrompt.length, 'chars)');
      
    } else {
      // WORKFLOW mode: Function calling
      const dynamicEnums = buildDynamicEnums(userInfo);
      const priceMappings = buildPriceMappings(userInfo.tarifs, userInfo.extras);
      
      systemPrompt = buildWorkflowPrompt(
        userContext,
        currentDateTime,
        availableRanges,
        dynamicEnums,
        priceMappings
      );
      
      // Build appointment tool with fail-fast validation
      // If enums are empty, the tool will be undefined and not exposed to the AI
      try {
        appointmentTool = buildAppointmentTool(dynamicEnums);
        console.log('[prompt] ✅ Appointment tool configured');
      } catch (error) {
        console.error('[prompt] ⚠️ Cannot build appointment tool:', error.message);
        console.error('[prompt] ⚠️ AI will operate without appointment creation capability');
        appointmentTool = undefined;
      }
      
      console.log('[prompt] ✅ WORKFLOW prompt built (', systemPrompt.length, 'chars)');
    }

    // ========================================
    // 9. CALL OPENAI API
    // ========================================
    console.log('\n[10/12] 🧠 Call OpenAI...');

    const { response, latencyMs } = await executeOpenAIRequest(
      systemPrompt,
      messages,
      enrichedMessage,
      aiMode,
      appointmentTool,
      env.OPENAI_API_KEY
    );

    console.log('[openai] ✅ Response received in', latencyMs, 'ms');
    
    await logOpenAICall(
      supabase, user_id, conversation_id,
      aiMode, latencyMs, response.usage, response.choices[0].finish_reason
    );

    // ========================================
    // 10. PROCESS RESPONSE (MODE-SPECIFIC)
    // ========================================
    console.log('\n[11/12] 🔄 Process response...');
    
    const choice = response.choices[0];
    let messageToSend: string;

    if (aiMode === AI_MODES.WAITING) {
      // ========================================
      // MODE WAITING: Parse JSON response
      // ========================================
      console.log('[waiting] Processing JSON response...');
      
      let waitingResponse;
      try {
        waitingResponse = JSON.parse(choice.message.content);
        messageToSend = waitingResponse.message;
      } catch (parseError) {
        console.error('[waiting] Failed to parse JSON response:', parseError);
        messageToSend = "Désolé, une erreur s'est produite. Réessayez ?";
      }
      
      console.log('[waiting] ✅ Message:', messageToSend.substring(0, 100));
      console.log('[waiting] ✅ Client arrived:', waitingResponse.client_has_arrived);
      console.log('[waiting] ✅ Confidence:', waitingResponse.confidence);
      
      // Log arrival detection
      await logArrivalDetection(
        supabase, user_id, conversation_id,
        waitingResponse.client_has_arrived,
        waitingResponse.confidence
      );
      
      // Update appointment if client arrived
      if (waitingResponse.client_has_arrived && todayAppointment) {
        console.log('[waiting] Updating appointment client_arrived flag...');
        
        const { error } = await supabase
          .from('appointments')
          .update({ client_arrived: true })
          .eq('id', todayAppointment.id);
        
        if (error) {
          console.error('[waiting] Error updating appointment:', error);
        } else {
          console.log('[waiting] ✅ Appointment updated');
        }
      }
      
    } else {
      // ========================================
      // MODE WORKFLOW: Handle function calls
      // ========================================
      console.log('[workflow] Processing response...');
      
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('[workflow] 🎯 Function call detected!');
        
        const toolCall = choice.message.tool_calls[0];
        let appointmentData;
        
        try {
          appointmentData = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          console.error('[workflow] ❌ Failed to parse function arguments:', parseError);
          console.error('[workflow] Raw arguments:', toolCall.function.arguments);
          
          await logError(
            supabase,
            user_id,
            conversation_id,
            `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            `Raw arguments: ${toolCall.function.arguments}${parseError instanceof Error ? '\nStack: ' + parseError.stack : ''}`
          );
          
          messageToSend = "Erreur de traitement. Réessaie ?";
        }
        
        if (appointmentData) {
          console.log('[workflow] Appointment data:', appointmentData);
          
          // ========================================
          // 10a. VALIDATE APPOINTMENT
          // ========================================
          console.log('[workflow] Validating appointment...');
          
          const dynamicEnums = buildDynamicEnums(userInfo);
          
          // Enum validation + duplicate check
          const validation = await validateAppointmentComplete(
            appointmentData,
            dynamicEnums,
            supabase,
            conversation_id
          );
          
          if (!validation.isValid) {
            console.error('[workflow] ❌ Validation failed:', validation.errors);
            
            await logValidationError(
              supabase, user_id, conversation_id,
              'appointment_validation',
              validation.errors
            );
            
            messageToSend = validation.isDuplicate
              ? "On dirait que ce RDV existe déjà 🤔"
              : "Erreur de validation. Réessaie ?";
              
          } else {
          // Time validation (availability + lead time)
          const timeValidation = validateAppointmentTimeDetailed(
            appointmentData.appointment_time,
            appointmentData.appointment_date,
            availableRanges,
            availabilities,
            appointments,
            now
          );
          
          if (!timeValidation.isValid) {
            console.error('[workflow] ❌ Time validation failed:', timeValidation.errorMessage);
            
            await logValidationError(
              supabase, user_id, conversation_id,
              'time_validation',
              [timeValidation.errorMessage!]
            );
            
            messageToSend = timeValidation.userMessage!;
            
          } else {
            // ========================================
            // 10b. CREATE APPOINTMENT
            // ========================================
            console.log('[workflow] ✅ All validations passed, creating appointment...');
            
            const priceMappings = buildPriceMappings(userInfo.tarifs, userInfo.extras);
            
            const appointment = await createAppointment(
              supabase,
              appointmentData,
              conversation_id,
              user_id,
              userInfo,
              priceMappings
            );
            
            console.log('[workflow] ✅ Appointment created:', appointment.id);
            
            await logAppointmentCreation(
              supabase, user_id, conversation_id,
              appointment.id,
              appointment
            );
            
            // Build confirmation message
            messageToSend = buildConfirmationMessage(
              appointmentData.appointment_date,
              appointmentData.appointment_time,
              appointmentData.duration,
              appointmentData.selected_extras,
              appointment.total_price,
              userInfo,
              priceMappings
            );
            
            console.log('[workflow] ✅ Confirmation message built');
          }
        }
        }

      } else {
        // No function call - regular message
        messageToSend = choice.message.content || "Hmm ?";
        console.log('[workflow] ✅ Regular message:', messageToSend.substring(0, 100));
      }
    }

    // ========================================
    // 11. SEND WHATSAPP MESSAGE
    // ========================================
    console.log('\n[12/12] 📤 Send WhatsApp message...');

    // Get conversation contact phone for security validation
    const conversationContact = await getConversationContactPhone(supabase, conversation_id);
    if (!conversationContact) {
      throw new Error('Conversation not found');
    }

    await sendWhatsAppMessageWithRetry(
      supabase,
      conversation_id,
      messageToSend,
      user_id,
      conversationContact.contact_phone
    );

    console.log('[whatsapp] ✅ Message sent');

    // ========================================
    // 12. RETURN SUCCESS RESPONSE
    // ========================================
    console.log('\n[12/12] ✅ Success!');
    console.log('=== 🎉 Request completed successfully ===\n');
    
    return new Response(
      JSON.stringify({ 
        success: true,
        ai_mode: aiMode,
        message_sent: messageToSend.substring(0, 100) + (messageToSend.length > 100 ? '...' : '')
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    // ========================================
    // ERROR HANDLING
    // ========================================
    console.error('\n❌ ERROR:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Try to log error (may fail if user_id/conversation_id not available)
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Use previously parsed request body, or try to parse if not available
      const body = requestBody || await request.json().catch(() => ({}));
      
      if (body.conversation_id) {
        const auth = await validateJWT(
          request.headers.get('Authorization'),
          env.JWT_SECRET
        ).catch(() => ({ isValid: false }));
        
        if (auth.isValid && auth.user_id) {
          const supabase = createClient(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY
          );
          
          await logError(
            supabase,
            auth.user_id,
            body.conversation_id,
            errorMessage,
            errorStack
          );
        }
      }
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
