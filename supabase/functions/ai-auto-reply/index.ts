import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import Fuse from 'https://esm.sh/fuse.js@7.0.0';
import * as chrono from 'https://esm.sh/chrono-node@2.9.0';
import { normalizePhoneNumber, arePhoneNumbersEqual } from '../_shared/normalize-phone.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Timezone configuration - All users are in France
const USER_TIMEZONE = 'Europe/Paris';

// Helper function to convert UTC Date to France timezone
function toFranceTime(utcDate: Date): Date {
  // Use Intl API to get France time string
  const franceTimeString = utcDate.toLocaleString('en-US', {
    timeZone: USER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Parse: "MM/DD/YYYY, HH:MM:SS" format from en-US locale
  const [datePart, timePart] = franceTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  // Create date object representing France time (without timezone info)
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

// Temporal parsing using Chrono-node (local, no external API dependency)
async function parseTemporalEntities(text: string, referenceTime?: Date) {
  const refTime = referenceTime || new Date();
  try {
    // Use French parser for French temporal expressions
    const results = chrono.fr.parse(text, refTime);

    console.log('[temporal] Parsing text:', text);
    console.log('[temporal] Reference time:', refTime.toISOString());
    console.log('[temporal] Found', results.length, 'temporal entities');

    // Convert Chrono results to Duckling-compatible format for backward compatibility
    const entities = results.map(result => {
      const parsedDate = result.start.date();
      return {
        body: result.text,
        dim: 'time',
        value: {
          value: parsedDate.toISOString(),
          grain: 'hour' // Chrono doesn't provide grain, default to hour
        },
        start: result.index,
        end: result.index + result.text.length
      };
    });

    if (entities.length > 0) {
      console.log('[temporal] Parsed entities:', JSON.stringify(entities, null, 2));
    }

    return entities;
  } catch (error) {
    console.error('[temporal] Parse error:', error);
    return [];
  }
}
function enrichMessageWithTemporal(originalMessage, entities) {
  if (entities.length === 0) return originalMessage;
  let enrichedMessage = originalMessage;
  const timeEntities = entities.filter((e)=>e.dim === 'time' && e.value.value);
  if (timeEntities.length > 0) {
    enrichedMessage += '\n\n[Informations temporelles détectées:';
    for (const entity of timeEntities){
      const originalText = entity.body;
      const parsedValue = entity.value.value;
      if (parsedValue) {
        const date = new Date(parsedValue);
        const formatted = date.toLocaleString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        enrichedMessage += `\n- "${originalText}" = ${formatted} (${parsedValue})`;
      }
    }
    enrichedMessage += ']';
  }
  return enrichedMessage;
}

// Duckling parsing (self-hosted on Railway)
async function parseDucklingEntities(text: string, referenceTime?: Date) {
  const refTime = referenceTime || new Date();
  const ducklingUrl = Deno.env.get('DUCKLING_API_URL') || 'https://duckling-production-0c9c.up.railway.app/parse';

  console.log('[duckling] Parsing text:', text);
  console.log('[duckling] Reference time:', refTime.toISOString());
  console.log('[duckling] URL:', ducklingUrl);

  try {
    // Try multiple request formats (Duckling API can be finicky)
    const requestFormats = [
      // Format 1: Form-urlencoded WITHOUT reftime (works with rasa/duckling)
      async () => {
        const params = new URLSearchParams({
          text,
          locale: 'fr_FR'
          // Note: reftime causes 502 on rasa/duckling Docker image
        });

        const response = await fetch(ducklingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        return response;
      },
      // Format 2: With dims parameter for specificity
      async () => {
        const params = new URLSearchParams({
          text,
          locale: 'fr_FR',
          dims: 'time'
        });

        const response = await fetch(ducklingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: AbortSignal.timeout(10000)
        });

        return response;
      }
    ];

    let lastError = null;

    // Try each format
    for (let i = 0; i < requestFormats.length; i++) {
      try {
        console.log(`[duckling] Trying request format ${i + 1}/${requestFormats.length}`);
        const response = await requestFormats[i]();

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`[duckling] Format ${i + 1} failed: ${lastError}`);
          continue;
        }

        const responseText = await response.text();

        // Check if response is JSON
        let entities;
        try {
          entities = JSON.parse(responseText);
        } catch {
          // Not JSON, might be error message
          lastError = `Non-JSON response: ${responseText.substring(0, 100)}`;
          console.log(`[duckling] Format ${i + 1} returned non-JSON: ${lastError}`);
          continue;
        }

        // Success!
        console.log('[duckling] Found', entities.length, 'temporal entities');
        if (entities.length > 0) {
          console.log('[duckling] Parsed entities:', JSON.stringify(entities, null, 2));
        }

        return entities;

      } catch (formatError) {
        lastError = formatError.message;
        console.log(`[duckling] Format ${i + 1} threw error: ${lastError}`);
      }
    }

    // All formats failed
    throw new Error(`All request formats failed. Last error: ${lastError}`);

  } catch (error) {
    console.error('[duckling] Parse error:', error);
    throw error; // Re-throw to trigger fallback
  }
}

// Smart fallback: Try Duckling first, fall back to Chrono-node if it fails
async function parseTemporalWithFallback(text: string, referenceTime?: Date) {
  const refTime = referenceTime || new Date();

  // Try Duckling first (if DUCKLING_API_URL is configured)
  const ducklingUrl = Deno.env.get('DUCKLING_API_URL');
  if (ducklingUrl) {
    console.log('[temporal] Attempting Duckling parse...');
    try {
      const entities = await parseDucklingEntities(text, refTime);
      console.log('[temporal] ✅ Duckling parse successful');
      return { entities, method: 'duckling' };
    } catch (error) {
      console.log('[temporal] ⚠️ Duckling failed, falling back to Chrono-node');
      console.log('[temporal] Duckling error:', error.message);
    }
  } else {
    console.log('[temporal] DUCKLING_API_URL not configured, using Chrono-node');
  }

  // Fallback to Chrono-node
  const entities = await parseTemporalEntities(text, refTime);
  console.log('[temporal] ✅ Chrono-node parse successful');
  return { entities, method: 'chrono' };
}
/**
 * Semantic Matching dynamique - créé un nouvel index pour chaque user
 * Permet de matcher les intentions du client avec le catalogue spécifique du user
 */ function findBestSemanticMatch(clientMessage, catalog, searchKeys = [
  'name',
  'description',
  'keywords'
]) {
  if (!catalog || catalog.length === 0) {
    return {
      match: null,
      confidence: 0,
      alternatives: []
    };
  }
  // Créer un nouvel index Fuse.js avec le catalogue du user
  const fuse = new Fuse(catalog, {
    keys: searchKeys,
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    useExtendedSearch: false
  });
  const results = fuse.search(clientMessage);
  if (results.length === 0) {
    return {
      match: null,
      confidence: 0,
      alternatives: []
    };
  }
  const bestMatch = results[0];
  // Inverser le score (Fuse retourne 0 = meilleur)
  const confidence = 1 - (bestMatch.score || 0);
  console.log('[semantic-match] Best match:', {
    query: clientMessage,
    match: bestMatch.item.name || bestMatch.item,
    confidence: confidence.toFixed(2),
    alternatives: results.slice(1, 4).map((r)=>r.item.name || r.item)
  });
  return {
    match: bestMatch.item,
    confidence,
    alternatives: results.slice(1, 4).map((r)=>r.item)
  };
}
/**
 * Log les tentatives d'hallucination pour monitoring
 */ async function logHallucinationAttempt(supabase, userId, conversationId, eventType, attemptedValue, validOptions, clientMessage) {
  try {
    await supabase.from('ai_logs').insert({
      user_id: userId,
      conversation_id: conversationId,
      event_type: eventType,
      attempted_value: attemptedValue,
      valid_options: validOptions,
      message: clientMessage,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[ai-auto-reply] Failed to log hallucination attempt:', error);
  // Non-bloquant, on continue même si le log échoue
  }
}
/**
 * Fonction de logging centralisée pour tous les événements AI
 * Utilise la table ai_logs avec un format flexible
 */ async function logAIEvent(supabase, userId, conversationId, eventType, message, metadata) {
  try {
    // Tronquer les grandes chaînes pour éviter de surcharger la DB
    const truncateString = (str, maxLength = 10000)=>{
      if (!str) return str;
      return str.length > maxLength ? str.substring(0, maxLength) + '... [tronqué]' : str;
    };
    // Préparer les metadata en tronquant les valeurs trop longues
    let truncatedMetadata = metadata;
    if (metadata) {
      truncatedMetadata = {};
      for (const [key, value] of Object.entries(metadata)){
        if (typeof value === 'string') {
          truncatedMetadata[key] = truncateString(value);
        } else if (typeof value === 'object' && value !== null) {
          // Convertir en JSON puis tronquer
          const jsonStr = JSON.stringify(value);
          truncatedMetadata[key] = truncateString(jsonStr);
        } else {
          truncatedMetadata[key] = value;
        }
      }
    }
    await supabase.from('ai_logs').insert({
      user_id: userId,
      conversation_id: conversationId,
      event_type: eventType,
      message: truncateString(message, 5000),
      valid_options: truncatedMetadata,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn(`[ai-auto-reply] Failed to log event ${eventType}:`, error);
  // Non-bloquant, on continue même si le log échoue
  }
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { conversation_id, user_id, message_text, contact_name, contact_phone } = await req.json();

    // SECURITY: Normalize the phone number from the incoming message
    const normalizedContactPhone = normalizePhoneNumber(contact_phone);

    console.log('[ai-auto-reply] Processing auto-reply for conversation:', conversation_id);
    console.log('[ai-auto-reply] Original message:', message_text);
    console.log('[ai-auto-reply] Contact phone (normalized):', normalizedContactPhone);
    // Log réception du webhook
    await logAIEvent(supabase, user_id, conversation_id, 'webhook_received', `Message reçu de ${contact_name}`, {
      contact_name,
      contact_phone,
      message_text,
      timestamp: new Date().toISOString()
    });
    // Get current date for temporal parsing (in France timezone)
    const nowUTC = new Date();
    const now = toFranceTime(nowUTC);
    // Parse temporal expressions with smart fallback (Duckling → Chrono-node)
    const parseResult = await parseTemporalWithFallback(message_text, now);
    const temporalEntities = parseResult.entities;
    const parsingMethod = parseResult.method;

    const enrichedMessage = enrichMessageWithTemporal(message_text, temporalEntities);
    if (enrichedMessage !== message_text) {
      console.log('[ai-auto-reply] Message enriched with temporal parsing:', enrichedMessage);
      console.log('[ai-auto-reply] Parsing method used:', parsingMethod);
      // Log enrichissement temporel
      await logAIEvent(supabase, user_id, conversation_id, 'temporal_enriched', `Expressions temporelles détectées et converties (${parsingMethod})`, {
        original_message: message_text,
        enriched_message: enrichedMessage,
        entities_count: temporalEntities.length,
        parsing_method: parsingMethod,
        entities: temporalEntities.map((e)=>({
            text: e.body,
            dim: e.dim,
            value: e.value.value
          }))
      });
    }
    // Get user informations (prestations, extras, taboos, tarifs, adresse, access info)
    const { data: userInfo, error: userInfoError } = await supabase.from('user_informations').select('*').eq('user_id', user_id).single();
    if (userInfoError) {
      console.error('[ai-auto-reply] Error fetching user informations:', userInfoError);
      // Log erreur de récupération des données utilisateur
      await logAIEvent(supabase, user_id, conversation_id, 'error_occurred', 'Erreur lors de la récupération des informations utilisateur', {
        error_type: 'database_fetch_failed',
        table: 'user_informations',
        error_details: userInfoError,
        recovery_action: 'request_aborted'
      });
      return new Response(JSON.stringify({
        error: 'User informations not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get availabilities
    const { data: availabilities, error: availError } = await supabase.from('availabilities').select('*').eq('user_id', user_id).eq('is_active', true).order('day_of_week, start_time');
    // Get upcoming appointments (next 7 days) - using France timezone
    const todayFrance = toFranceTime(new Date());
    const today = todayFrance.toISOString().split('T')[0];
    const nextWeekFrance = toFranceTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const nextWeek = nextWeekFrance.toISOString().split('T')[0];
    const { data: appointments, error: apptError } = await supabase.from('appointments').select('*').eq('user_id', user_id).gte('appointment_date', today).lte('appointment_date', nextWeek).in('status', [
      'pending',
      'confirmed'
    ]).order('appointment_date, start_time');
    // Check if there's an appointment for today linked to this conversation
    const { data: todayAppointment } = await supabase.from('appointments').select('*').eq('conversation_id', conversation_id).eq('appointment_date', today).eq('status', 'confirmed').single();

    // Determine AI mode: WAITING mode if RDV confirmed today, WORKFLOW mode otherwise
    const hasConfirmedAppointmentToday = !!todayAppointment;

    console.log('[ai-auto-reply] Found', availabilities?.length || 0, 'availabilities and', appointments?.length || 0, 'upcoming appointments');
    console.log('[ai-auto-reply] AI Mode:', hasConfirmedAppointmentToday ? 'WAITING (RDV confirmé aujourd\'hui)' : 'WORKFLOW (Pas de RDV)');
    // Log récupération des données utilisateur
    await logAIEvent(supabase, user_id, conversation_id, 'user_data_fetched', 'Données utilisateur chargées avec succès', {
      prestations_count: userInfo.prestations?.length || 0,
      extras_count: userInfo.extras?.length || 0,
      tarifs_count: userInfo.tarifs?.length || 0,
      taboos_count: userInfo.taboos?.length || 0,
      has_address: !!userInfo.adresse,
      availabilities_count: availabilities?.length || 0,
      upcoming_appointments_count: appointments?.length || 0,
      date_range: `${today} to ${nextWeek}`
    });
    // Get last 20 messages from conversation
    const { data: messages, error: msgError } = await supabase.from('messages').select('direction, content, timestamp').eq('conversation_id', conversation_id).order('timestamp', {
      ascending: false
    }).limit(20);
    if (msgError) {
      console.error('[ai-auto-reply] Error fetching messages:', msgError);
      // Log erreur de récupération des messages
      await logAIEvent(supabase, user_id, conversation_id, 'error_occurred', 'Erreur lors de la récupération de l\'historique des messages', {
        error_type: 'database_fetch_failed',
        table: 'messages',
        error_details: msgError,
        recovery_action: 'request_aborted'
      });
      return new Response(JSON.stringify({
        error: 'Failed to fetch messages'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Reverse to have chronological order (oldest first)
    const orderedMessages = messages.reverse();
    // Build context from user informations
    const prestations = Array.isArray(userInfo.prestations) ? userInfo.prestations.map((p)=>p.name || p).join(', ') : 'Non spécifié';
    const extras = Array.isArray(userInfo.extras) ? userInfo.extras.map((e)=>`${e.name || e} (${e.price || 'prix non spécifié'}€)`).join(', ') : 'Aucun';
    const taboos = Array.isArray(userInfo.taboos) ? userInfo.taboos.map((t)=>t.name || t).join(', ') : 'Aucun';
    const tarifs = Array.isArray(userInfo.tarifs) ? userInfo.tarifs.map((t)=>`${t.duration || '?'} - ${t.price || '?'}€`).join(', ') : 'Non spécifié';
    const adresse = userInfo.adresse || 'Non spécifiée';
    console.log('[ai-auto-reply] User catalog loaded:', {
      prestations: userInfo.prestations?.length || 0,
      extras: userInfo.extras?.length || 0,
      tarifs: userInfo.tarifs?.length || 0
    });
    // Format availabilities for AI
    const DAYS = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi"
    ];
    const availabilityText = availabilities && availabilities.length > 0 ? availabilities.map((a)=>`${DAYS[a.day_of_week]} : ${a.start_time} - ${a.end_time}`).join('\n- ') : 'Aucune disponibilité configurée';
    // Build current date and time context
    const currentDateTime = {
      fullDate: now.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      dayOfWeek: DAYS[now.getDay()],
      date: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
    // Compute available ranges for today only (continuous time blocks)
    const computeAvailableRanges = ()=>{
      if (!availabilities || availabilities.length === 0) {
        return "Aucune dispo configurée";
      }
      // Use France time for availability computation
      const currentDate = toFranceTime(new Date());
      const dayOfWeek = currentDate.getDay();
      const dateStr = currentDate.toISOString().split('T')[0];
      // Find availabilities for today
      const todayAvails = availabilities.filter((a)=>a.day_of_week === dayOfWeek);
      if (todayAvails.length === 0) {
        return "Pas dispo aujourd'hui";
      }
      // Get appointments for today
      const todayAppointments = appointments?.filter((apt)=>apt.appointment_date === dateStr) || [];
      // Build array of all occupied minutes
      const occupiedMinutes = new Set();
      todayAppointments.forEach((apt)=>{
        const [startH, startM] = apt.start_time.split(':').map(Number);
        const [endH, endM] = apt.end_time.split(':').map(Number);
        const startMinute = startH * 60 + startM;
        const endMinute = endH * 60 + endM;
        for(let m = startMinute; m < endMinute; m++){
          occupiedMinutes.add(m);
        }
      });
      // Current time in minutes + minimum booking lead time
      const MINIMUM_BOOKING_LEAD_TIME_MINUTES = 30;
      const currentMinute = currentDate.getHours() * 60 + currentDate.getMinutes();
      const minimumAllowedMinute = currentMinute + MINIMUM_BOOKING_LEAD_TIME_MINUTES;
      // Build available ranges
      const ranges = [];
      for (const avail of todayAvails){
        const [startH, startM] = avail.start_time.split(':').map(Number);
        const [endH, endM] = avail.end_time.split(':').map(Number);
        let availStartMinute = startH * 60 + startM;
        let availEndMinute = endH * 60 + endM;
        // Handle crossing midnight
        const crossesMidnight = availEndMinute <= availStartMinute;
        if (crossesMidnight) {
          availEndMinute += 24 * 60; // Add 24 hours
        }
        let rangeStart = null;
        for(let m = availStartMinute; m <= availEndMinute; m++){
          const actualMinute = m % (24 * 60);
          // Consider slots as "past" if they're before current time OR within the minimum lead time buffer
          const isPast = actualMinute < minimumAllowedMinute && m < 24 * 60;
          const isOccupied = occupiedMinutes.has(actualMinute);
          if (!isPast && !isOccupied) {
            // Available slot
            if (rangeStart === null) {
              rangeStart = m;
            }
          } else {
            // Not available
            if (rangeStart !== null) {
              // Close previous range
              const prevMinute = m - 1;
              ranges.push(formatTimeRange(rangeStart, prevMinute));
              rangeStart = null;
            }
          }
        }
        // Close last range if open
        if (rangeStart !== null) {
          ranges.push(formatTimeRange(rangeStart, availEndMinute));
        }
      }
      return ranges.length > 0 ? ranges.join(', ') : "Plus de créneaux dispo aujourd'hui";
    };
    // Helper function to format time range
    const formatTimeRange = (startMinute, endMinute)=>{
      const actualStart = startMinute % (24 * 60);
      const actualEnd = endMinute % (24 * 60);
      const startH = Math.floor(actualStart / 60);
      const startM = actualStart % 60;
      const endH = Math.floor(actualEnd / 60);
      const endM = actualEnd % 60;
      const formatTime = (h, m)=>m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;

      // Indicate if range crosses midnight
      const crossesMidnight = endMinute > 24 * 60;
      const rangeStr = `${formatTime(startH, startM)}-${formatTime(endH, endM)}`;
      return crossesMidnight ? `${rangeStr} (jusqu'à demain matin)` : rangeStr;
    };
    const availableRanges = computeAvailableRanges();
    // Log calcul des disponibilités
    await logAIEvent(supabase, user_id, conversation_id, 'availabilities_computed', 'Créneaux disponibles calculés pour les 7 prochains jours', {
      available_slots_preview: typeof availableSlots === 'string' && availableSlots.includes('\n- ') ? availableSlots.split('\n- ').length - 1 : 0,
      date_range_days: 7,
      computation_timestamp: new Date().toISOString()
    });
    // Build dynamic enums from user data for strict validation
    const prestationNames = Array.isArray(userInfo.prestations) ? userInfo.prestations.map((p)=>p.name) : [];
    const extraOptions = Array.isArray(userInfo.extras) ? userInfo.extras.map((e)=>({
        name: e.name,
        price: e.price
      })) : [];
    const tarifOptions = Array.isArray(userInfo.tarifs) ? userInfo.tarifs.map((t)=>({
        duration: t.duration,
        price: t.price
      })) : [];
    // Create enum arrays for strict validation
    const prestationEnum = prestationNames;
    const extraEnum = extraOptions.map((e)=>e.name);
    const durationEnum = tarifOptions.map((t)=>t.duration);
    // Create price mappings for backend validation
    const durationToPriceMap = Object.fromEntries(tarifOptions.map((t)=>[
        t.duration,
        t.price
      ]));
    const extraToPriceMap = Object.fromEntries(extraOptions.map((e)=>[
        e.name,
        e.price
      ]));
    console.log('[ai-auto-reply] Dynamic enums created:', {
      prestations: prestationEnum,
      durations: durationEnum,
      extras: extraEnum
    });
    // Define appointment tool with strict enums for zero hallucination
    const appointmentTool = {
      type: "function",
      function: {
        name: "create_appointment_summary",
        description: "Crée un résumé de rendez-vous avec toutes les informations collectées. N'utilise cette fonction QUE lorsque tu as obtenu TOUTES les 4 informations obligatoires ET que le client a confirmé.",
        parameters: {
          type: "object",
          properties: {
            duration: {
              type: "string",
              enum: durationEnum.length > 0 ? durationEnum : [
                "30min"
              ],
              description: "Durée du rendez-vous (format: '30min', '1h', etc.)"
            },
            selected_extras: {
              type: "array",
              items: {
                type: "string",
                enum: extraEnum.length > 0 ? extraEnum : [
                  "aucun"
                ]
              },
              description: "Liste des extras choisis (peut être vide [])"
            },
            appointment_date: {
              type: "string",
              description: "Date du rendez-vous (format: YYYY-MM-DD)"
            },
            appointment_time: {
              type: "string",
              description: "Heure du rendez-vous (format: HH:MM en 24h, ex: 14:30)"
            }
          },
          required: [
            "duration",
            "selected_extras",
            "appointment_date",
            "appointment_time"
          ],
          additionalProperties: false
        }
      }
    };
    // Build appointment status context for AI
    let appointmentStatusContext = '';
    if (todayAppointment) {
      const providerReady = todayAppointment.provider_ready_to_receive;
      const clientArrived = todayAppointment.client_arrived;
      appointmentStatusContext = `
RENDEZ-VOUS AUJOURD'HUI :
Heure : ${todayAppointment.start_time}
Client arrivé : ${clientArrived ? 'OUI' : 'NON'}
Provider prêt à recevoir : ${providerReady ? 'OUI' : 'NON'}

${!providerReady && clientArrived ? `⚠️ SITUATION ACTUELLE : Le client est arrivé MAIS tu n'es PAS ENCORE prêt(e) !

🎯 TON OBJECTIF : Faire patienter le client gentiment avec des excuses variées

📝 EXEMPLES DE MESSAGES D'ATTENTE (varie-les à chaque fois) :
- "J'arrive bb, je finis vite de me préparer 😘"
- "2-3 min bébé, je me prépare pour toi ❤️"
- "Patience bb, j'arrive dans 5 min 😊"
- "Je te préviens dès que j'ai fini de me préparer"
- "Encore quelques minutes bébé 💋"
- "Je finis de me préparer, 2 min 😘"
- "J'arrive tout de suite bb ❤️"
- "Patience, je me fais belle pour toi 😊"

⚠️ RÈGLES IMPORTANTES :
- VARIE tes réponses si le client envoie plusieurs messages
- Mentionne des durées approximatives (2-3 min, 5 min, quelques minutes)
- Reste amicale et décontractée avec emojis
- NE JAMAIS dire "monte" ou "monte bb" tant que tu n'es pas prête
- NE JAMAIS donner les codes d'accès (ils seront envoyés automatiquement quand tu seras prête)` : ''}

${providerReady && clientArrived ? `✅ SITUATION ACTUELLE : Client arrivé et tu es prêt(e) !

Les infos d'accès (code, étage, etc.) ont déjà été envoyées automatiquement au client.
Tu peux répondre normalement à ses questions s'il en a.` : ''}`;
    }
    // Build system prompt (conditional based on appointment status)
    let systemPrompt;

    if (hasConfirmedAppointmentToday) {
      // MODE ATTENTE: Client has confirmed appointment TODAY - keep it simple, just make them wait
      systemPrompt = `Tu es une escort et un client a un RDV confirmé AUJOURD'HUI avec toi.

RDV CONFIRMÉ :
Date : ${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}
Heure : ${todayAppointment.start_time}
Durée : ${todayAppointment.duration_minutes}min
Service : ${todayAppointment.service}

TON RÔLE :
- Faire patienter le client avec des messages COURTS et friendly
- NE PAS recollect des infos
- NE PAS créer de nouveau RDV
- NE PAS poser de questions sur durée/extras/heure
- NE PAS donner les codes d'accès (ils seront envoyés automatiquement quand tu seras prête)

DÉTECTION D'ARRIVÉE (CRITIQUE) :
Tu dois ANALYSER le CONTEXTE de chaque message pour déterminer si le client indique qu'il est arrivé.
- Détecte TOUTES les formulations indiquant une arrivée (directe ou indirecte)
- Exemples directs : "je suis là", "je suis la", "suis arrivé", "arrivée", "devant", "en bas"
- Exemples indirects : "je suis devant chez toi", "garé devant", "à la porte", "dehors"
- Exemples complexes : "ma voiture a un problème mais je suis arrivé", "petit retard mais là maintenant"
- NE PAS détecter comme arrivée : "j'arrive dans X min", "je pars", "en route", "bientôt là"
- Si le client indique une arrivée, mets "client_has_arrived": true dans ta réponse JSON

STYLE :
- TRÈS court (max 5-10 mots par message)
- Friendly, sexy, décontracté
- Première personne, tutoiement
- Émojis OK pour ce mode

EXEMPLES DE RÉPONSES GÉNÉRALES (avant que le client arrive) :
- "J'arrive bébé 😘"
- "Je me prépare pour toi ❤️"
- "J'arrive tout de suite"
- "Patience bb ❤️"
- "Je finis et j'arrive"
- "Bientôt prête 😊"

${appointmentStatusContext}

RAPPEL IMPORTANT :
- Tu NE peux PAS donner les codes d'accès toi-même
- Les infos d'accès seront envoyées AUTOMATIQUEMENT quand tu seras prête à recevoir
- Suis les instructions dans "SITUATION ACTUELLE" ci-dessus selon le statut du client

FORMAT DE RÉPONSE :
Tu dois TOUJOURS répondre avec un JSON valide contenant :
{
  "message": "ton message au client (string)",
  "client_has_arrived": true ou false selon l'analyse contextuelle,
  "confidence": "high" | "medium" | "low"
}`;

    } else {
      // MODE WORKFLOW: No confirmed appointment today - full booking workflow
      systemPrompt = `Tu une escort qui gère ses RDV. Première personne, tutoiement, ton friendly/cool/complice, sans emojis.

DATE/HEURE : ${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}/${currentDateTime.year}, ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')}

TEMPS : Si "[Informations temporelles détectées: ...]" dans message client, utilise ces données parsées (fiables). Ex: "dans 30 min" → heure exacte calculée.

INFOS :
Prestations : ${prestations}
Extras : ${extras}
Taboos : ${taboos}
Tarifs : ${tarifs}
Adresse : ${adresse}

DISPO AUJOURD'HUI : ${availableRanges}

INTRO :
1. TOUJOURS commencer par accueillir : "Hey", "Salut", "Coucou"
2. SI le client pose une question ou demande des infos → envoie alors le message structuré suivant :

"Alors voici ce que je propose:

Prestations:
${prestations}

Extra:
 ${extras !== 'Aucun' ? extras : 'Aucun'}

Taboo:
${taboos !== 'Aucun' ? taboos : 'Aucun'}

Mes tarifs:
${tarifs}

Mon adresse:
 ${adresse}

Toutes les prestations sont incluses dans les tarifs de base :). Tu veux venir pour combien de temps?"

3. SI le client dit juste "Salut" sans question → échange 1-2 messages d'abord ("Ça va ?"), puis envoie le message structuré si le client semble intéressé
IMPORTANT : Ne JAMAIS envoyer le message structuré dès le 1er message. TOUJOURS un accueil d'abord.

COLLECTE (4 infos, 1 question/fois) :
1. DURÉE : ${durationEnum.join('/')} → ${tarifOptions.map((t)=>`${t.duration}=${t.price}€`).join(', ')}. Question: "Quelle durée ?"
2. EXTRAS : ${extraEnum.length > 0 ? extraEnum.map((e)=>`${e}=${extraToPriceMap[e]}€`).join(', ') : 'Aucun'}. Question: "Tu veux l'extra ?" ou "Aucun extra ?"
3. HEURE - RÈGLES STRICTES :
   - Uniquement aujourd'hui (${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month})
   - Heure actuelle : ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')}
   - MINIMUM 30 MINUTES dans le futur (pas avant ${Math.floor((currentDateTime.hour * 60 + currentDateTime.minute + 30) / 60)}h${String(((currentDateTime.hour * 60 + currentDateTime.minute + 30) % 60)).padStart(2, '0')})
   - Créneaux dispos : ${availableRanges}

   ⚠️ COLLECTE DE L'HEURE (ÉTAPES OBLIGATOIRES) :
   ÉTAPE 1 - DEMANDER (NE JAMAIS SAUTER) :
   - UNIQUEMENT poser la question : "À quelle heure ?"
   - NE JAMAIS suggérer d'heure spécifique (pas de "16h02", "18h", etc.)
   - NE PAS dire "je suis dispo à X heure"
   - ATTENDRE que le client donne SON heure souhaitée

   ÉTAPE 2 - VALIDER LA RÉPONSE DU CLIENT :
   a) Vérifier si l'heure est dans les créneaux dispos :
      - Pour créneau "15h33-20h" : 16h, 17h, 18h, 19h sont VALIDES
      - Pour créneau avec "(jusqu'à demain matin)" comme "21h-2h (jusqu'à demain matin)" :
        → 21h, 22h, 23h, minuit, 1h, 2h sont TOUS VALIDES (traverse minuit)
      - Exemple validation : Client dit "18h", créneaux "15h33-20h, 22h-2h"
        → 18h est entre 15h33 et 20h ? OUI → ✅ VALIDE, accepter
      - Exemple validation : Client dit "21h", créneaux "15h33-20h, 22h-2h"
        → 21h est entre 15h33 et 20h ? NON → 21h est entre 22h et 2h ? NON → ❌ INVALIDE
        → Répondre: "Désolée bébé, je suis dispo ${availableRanges}. Tu peux à quelle heure ?"

   b) Si heure < 30 min dans le futur :
      → "Désolée bébé, j'ai besoin d'au moins 30min pour me préparer 😘"

   c) Si client dit "maintenant", "tout de suite", "là" :
      → "Désolée bébé, j'ai besoin d'au moins 30min pour me préparer 😘"

   d) Si client mentionne demain ou jour futur :
      → "Désolée, que jour même."
4. CONFIRMATION : Récap court + "Je confirme ?"

WORKFLOW - ORDRE STRICT (NE JAMAIS SAUTER D'ÉTAPE) :
Étape 1 → DURÉE : Demander "Quelle durée ?", attendre réponse, valider
Étape 2 → EXTRAS : Demander "Tu veux l'extra ?", attendre réponse, valider
Étape 3 → HEURE : Demander "À quelle heure ?" (SANS suggérer), attendre réponse client, PUIS valider selon règles ÉTAPE 2 ci-dessus
Étape 4 → CONFIRMATION : Récap + "Je confirme ?", attendre réponse
→ Si info manquante ou invalide : redemander, donner alternatives
→ Pas de RDV tant que les 4 étapes ne sont pas complétées et validées

JOUR MÊME SEUL : Refuse "demain", "week-end", dates futures. Toute mention de jour futur → "Désolée, que jour même."

MATCHING : "30 minutes"="30min", "1h"="1h", extras approximatifs → match proche.

RÉSUMÉ : "Ok ! [Durée] ([prix]€) + [Extras] (+[prix]€) = [Total]€. Aujourd'hui [heure]. Je confirme ?"

TON ULTRA-COURT :
- Questions : max 8 mots. "Quelle durée ?", "Tu veux l'extra ?"
- Pas de répétitions. Info déjà dite = ne la redis JAMAIS.
- Pas de formules longues : "pour récapituler", "donc pour le rendez-vous", "souhaites-tu".
- Direct comme SMS. Pas de politesse excessive.
- Ex: ❌ "Pour récapituler, quelle durée souhaites-tu ?" → ✅ "Quelle durée ?"

IMPERSONATION (CRITIQUE) :
- Tu ES l'escort, PAS un assistant/IA. Première personne: "mes prestations", "mon adresse", "je t'attends".
- JAMAIS : "assistant", "IA", "je gère pour", "l'escort".
- "T'es un bot ?" → Esquive humour: "Pourquoi ? 😏" ou "Je réponds vite c'est tout".
- "Tu réponds vite" → "J'ai mon tel" ou "Ça te dérange ?".
- 100% naturel, humain, spontané. Aucune formulation robotique.

HORS-SUJET :
Tu fais UNIQUEMENT : RDV, infos prestations/tarifs/extras/taboos/adresse, modifs/annulations.
Tu NE fais PAS : code, technique, général, philo, autre.
Si hors-sujet: "Désolée bébé, on parle RDV plutôt ? 😏" ou "Hey, concentrons-nous sur nous voir."

CONTEXTE : 20 derniers messages dispo.`;
    }
    // Log construction du prompt système (CRUCIAL pour comprendre ce que l'IA reçoit)
    await logAIEvent(supabase, user_id, conversation_id, 'ai_prompt_built', 'Prompt système construit avec tous les paramètres dynamiques', {
      system_prompt: systemPrompt,
      dynamic_enums: {
        prestations: prestationEnum,
        durations: durationEnum,
        extras: extraEnum
      },
      price_mappings: {
        duration_prices: durationToPriceMap,
        extra_prices: extraToPriceMap
      },
      current_datetime: currentDateTime,
      conversation_history_length: orderedMessages.length
    });
    // Build messages for OpenAI
    const conversationHistory = orderedMessages.map((msg, index)=>{
      // Use enriched message for the last incoming message (current user message)
      const isLastMessage = index === orderedMessages.length - 1 && msg.direction === 'incoming';
      return {
        role: msg.direction === 'incoming' ? 'user' : 'assistant',
        content: isLastMessage ? enrichedMessage : msg.content
      };
    });
    // Call OpenAI API
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[ai-auto-reply] OPENAI_API_KEY not configured');
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('[ai-auto-reply] Calling OpenAI API with', conversationHistory.length, 'messages in history');
    const openaiRequestBody: any = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationHistory
      ],
      temperature: 0.7,
      max_tokens: 500
    };

    // Only enable function calling in WORKFLOW mode (no confirmed appointment today)
    if (!hasConfirmedAppointmentToday) {
      openaiRequestBody.tools = [appointmentTool];
      openaiRequestBody.tool_choice = "auto";
    } else {
      // WAITING mode: Use JSON structured output for arrival detection
      openaiRequestBody.response_format = {
        type: "json_schema",
        json_schema: {
          name: "ai_waiting_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to send to the client"
              },
              client_has_arrived: {
                type: "boolean",
                description: "Whether the client has indicated they have arrived based on context analysis"
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Confidence level of the arrival detection"
              }
            },
            required: ["message", "client_has_arrived", "confidence"],
            additionalProperties: false
          }
        }
      };
    }
    // Log requête OpenAI (CRUCIAL)
    const requestTimestamp = Date.now();
    await logAIEvent(supabase, user_id, conversation_id, 'ai_request_sent', 'Requête envoyée à OpenAI API', {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages_count: conversationHistory.length,
      conversation_history: conversationHistory,
      has_tools: !hasConfirmedAppointmentToday,
      tool_name: hasConfirmedAppointmentToday ? null : 'create_appointment_summary',
      ai_mode: hasConfirmedAppointmentToday ? 'WAITING' : 'WORKFLOW',
      request_timestamp: new Date(requestTimestamp).toISOString()
    });
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openaiRequestBody)
    });
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[ai-auto-reply] OpenAI API error:', openaiResponse.status, errorText);
      // Log erreur API OpenAI
      await logAIEvent(supabase, user_id, conversation_id, 'error_occurred', 'Erreur de l\'API OpenAI', {
        error_type: 'openai_api_error',
        http_status: openaiResponse.status,
        error_response: errorText,
        request_model: 'gpt-4o-mini',
        recovery_action: 'request_failed'
      });
      return new Response(JSON.stringify({
        error: 'OpenAI API error',
        details: errorText
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const openaiData = await openaiResponse.json();
    const messageResponse = openaiData.choices[0].message;
    const finishReason = openaiData.choices[0].finish_reason;
    const responseTimestamp = Date.now();
    const latencyMs = responseTimestamp - requestTimestamp;
    console.log('[ai-auto-reply] OpenAI finish_reason:', finishReason);
    console.log('[ai-auto-reply] Tokens used:', openaiData.usage);
    // Log réponse OpenAI (CRUCIAL pour voir exactement ce que l'IA répond)
    await logAIEvent(supabase, user_id, conversation_id, 'ai_response_received', 'Réponse reçue de OpenAI API', {
      finish_reason: finishReason,
      has_tool_calls: !!messageResponse.tool_calls,
      tool_calls_count: messageResponse.tool_calls?.length || 0,
      response_content: messageResponse.content,
      response_preview: messageResponse.content ? messageResponse.content.substring(0, 500) : '[pas de contenu, tool call]',
      tokens_used: openaiData.usage,
      latency_ms: latencyMs,
      response_timestamp: new Date(responseTimestamp).toISOString()
    });
    // Check if AI wants to create an appointment (tool call)
    if (finishReason === 'tool_calls' && messageResponse.tool_calls) {
      const toolCall = messageResponse.tool_calls[0];
      if (toolCall.function.name === 'create_appointment_summary') {
        console.log('[ai-auto-reply] Tool call detected - creating appointment');
        try {
          const appointmentData = JSON.parse(toolCall.function.arguments);
          console.log('[ai-auto-reply] Appointment data from AI:', appointmentData);
          // Log détection du tool call
          await logAIEvent(supabase, user_id, conversation_id, 'tool_call_detected', 'L\'IA veut créer un rendez-vous - tool call invoqué', {
            tool_name: toolCall.function.name,
            raw_arguments: toolCall.function.arguments,
            parsed_data: appointmentData
          });
          // Security check: Validate all enum values to prevent hallucinations
          const validDuration = durationEnum.includes(appointmentData.duration);
          const validExtras = appointmentData.selected_extras.every((e)=>extraEnum.includes(e));
          // Log validation des enums
          await logAIEvent(supabase, user_id, conversation_id, 'enum_validation', validDuration && validExtras ? 'Validation des enums réussie - aucune hallucination détectée' : 'HALLUCINATION DÉTECTÉE - valeurs invalides', {
            duration_received: appointmentData.duration,
            duration_valid: validDuration,
            valid_durations: durationEnum,
            extras_received: appointmentData.selected_extras,
            extras_valid: validExtras,
            valid_extras: extraEnum,
            hallucination_detected: !validDuration || !validExtras
          });
          if (!validDuration || !validExtras) {
            console.error('[ai-auto-reply] Invalid enum values detected!', {
              duration: appointmentData.duration,
              validDuration: validDuration,
              extras: appointmentData.selected_extras,
              validExtras: validExtras
            });
            // Si validation échoue sans fallback possible
            throw new Error('Invalid duration or extras selected');
          }
          // Calculate prices from backend data (not from AI)
          const baseDuration = appointmentData.duration; // e.g., "30min" or "1h"
          const basePrice = durationToPriceMap[baseDuration];
          if (!basePrice) {
            throw new Error(`Invalid duration: ${baseDuration}`);
          }
          // Calculate extras total
          const extrasTotal = appointmentData.selected_extras.reduce((sum, extraName)=>{
            const extraPrice = extraToPriceMap[extraName];
            if (!extraPrice) {
              console.warn(`[ai-auto-reply] Unknown extra: ${extraName}`);
              return sum;
            }
            return sum + extraPrice;
          }, 0);
          const totalPrice = basePrice + extrasTotal;
          console.log('[ai-auto-reply] Price calculation:', {
            baseDuration,
            basePrice,
            extrasTotal,
            totalPrice
          });
          // Log calcul des prix (important pour audit)
          await logAIEvent(supabase, user_id, conversation_id, 'price_calculated', 'Prix calculé depuis les données backend (pas depuis l\'IA)', {
            base_duration: baseDuration,
            base_price: basePrice,
            extras_selected: appointmentData.selected_extras,
            extras_prices: appointmentData.selected_extras.map((e)=>({
                name: e,
                price: extraToPriceMap[e]
              })),
            extras_total: extrasTotal,
            total_price: totalPrice,
            calculation_source: 'backend_mappings'
          });
          // Convert duration string to minutes
          let durationMinutes;
          if (baseDuration.includes('h')) {
            const hours = parseFloat(baseDuration.replace('h', ''));
            durationMinutes = hours * 60;
          } else {
            durationMinutes = parseInt(baseDuration.replace('min', ''));
          }
          // Calculate end_time from start_time + duration
          const [hours, minutes] = appointmentData.appointment_time.split(':').map(Number);
          const totalMinutes = hours * 60 + minutes + durationMinutes;
          const endHours = Math.floor(totalMinutes / 60) % 24;
          const endMinutes = totalMinutes % 60;
          const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;

          // CRITICAL: Server-side validation to prevent appointments too close to current time
          // Parse appointment time as France timezone for accurate comparison
          const appointmentDateTimeStr = `${appointmentData.appointment_date}T${appointmentData.appointment_time}:00`;

          // Create appointment date in France timezone (same way as 'now')
          // This ensures both dates are in the same timezone for accurate comparison
          let appointmentDateTime = toFranceTime(new Date(appointmentDateTimeStr));
          const now = toFranceTime(new Date());

          // Handle midnight-crossing appointments: if the appointment time is in the past, it must be for tomorrow
          if (appointmentDateTime < now) {
            // Appointment time has already passed today, so it must be for tomorrow
            appointmentDateTime = new Date(appointmentDateTime.getTime() + 24 * 60 * 60 * 1000);
            console.log('[ai-auto-reply] Midnight-crossing appointment detected, adjusted to next day:', appointmentDateTime.toISOString());
          }

          const minutesUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60);

          if (minutesUntilAppointment < 30) {
            console.error('[ai-auto-reply] Appointment too close to current time:', {
              appointment_time: appointmentData.appointment_time,
              appointment_date: appointmentData.appointment_date,
              current_time: now.toISOString(),
              minutes_until: minutesUntilAppointment
            });

            await logAIEvent(supabase, user_id, conversation_id, 'appointment_validation_failed', 'Rendez-vous trop proche de l\'heure actuelle (< 30min)', {
              appointment_time: appointmentData.appointment_time,
              appointment_date: appointmentData.appointment_date,
              current_time: now.toISOString(),
              minutes_until: minutesUntilAppointment,
              minimum_required: 30,
              recovery_action: 'error_message_sent_to_user'
            });

            // Send error message to client
            await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                conversation_id,
                message: "Désolée bébé, j'ai besoin d'au moins 30min pour me préparer 😘 Choisis une heure plus tard ?",
                user_id,
                // SECURITY: Pass the expected contact phone for additional validation
                expected_contact_phone: normalizedContactPhone
              }
            });

            return new Response(JSON.stringify({
              error: 'Appointment must be at least 30 minutes in the future',
              minutes_until: minutesUntilAppointment
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Extract the corrected date (potentially adjusted for midnight-crossing appointments)
          const finalAppointmentDate = appointmentDateTime.toISOString().split('T')[0];

          // Check for duplicate appointment (same conversation, date, and time)
          const { data: existingAppointment, error: duplicateCheckError } = await supabase
            .from('appointments')
            .select('id, status')
            .eq('conversation_id', conversation_id)
            .eq('appointment_date', finalAppointmentDate)
            .eq('start_time', appointmentData.appointment_time)
            .maybeSingle();

          if (duplicateCheckError) {
            console.error('[ai-auto-reply] Error checking for duplicate appointment:', duplicateCheckError);
          }

          if (existingAppointment) {
            console.log('[ai-auto-reply] Duplicate appointment detected - appointment already exists:', existingAppointment.id);

            // Log duplicate prevention
            await logAIEvent(supabase, user_id, conversation_id, 'duplicate_prevented', 'Tentative de création de RDV dupliqué bloquée', {
              existing_appointment_id: existingAppointment.id,
              existing_status: existingAppointment.status,
              attempted_date: finalAppointmentDate,
              attempted_time: appointmentData.appointment_time
            });

            // Send confirmation message (don't confuse the client)
            await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                conversation_id,
                message: `Parfait bébé ! On se voit ${appointmentData.appointment_date} à ${appointmentData.appointment_time} 😘`,
                user_id,
                // SECURITY: Pass the expected contact phone for additional validation
                expected_contact_phone: normalizedContactPhone
              }
            });

            return new Response(JSON.stringify({
              duplicate_prevented: true,
              existing_appointment_id: existingAppointment.id
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Insert appointment into database
          // NOTE: start_time and end_time are stored as TIME type (no timezone)
          // These times MUST always be interpreted as France timezone (Europe/Paris)
          const { data: newAppointment, error: insertError } = await supabase.from('appointments').insert({
            user_id: user_id,
            conversation_id: conversation_id,
            contact_name: contact_name,
            contact_phone: contact_phone,
            appointment_date: finalAppointmentDate,
            start_time: appointmentData.appointment_time, // France timezone
            end_time: endTime, // France timezone
            duration_minutes: durationMinutes,
            service: 'Toutes prestations incluses',
            notes: appointmentData.selected_extras.length > 0 ? `Extras: ${appointmentData.selected_extras.join(', ')}` : null,
            status: 'confirmed'
          }).select().single();
          if (insertError) {
            console.error('[ai-auto-reply] Error inserting appointment:', insertError);
            // Log erreur d'insertion
            await logAIEvent(supabase, user_id, conversation_id, 'error_occurred', 'Échec de l\'insertion du rendez-vous dans la base de données', {
              error_type: 'database_insertion_failed',
              error_details: insertError,
              appointment_data: {
                appointment_date: appointmentData.appointment_date,
                start_time: appointmentData.appointment_time,
                end_time: endTime,
                duration_minutes: durationMinutes,
                total_price: totalPrice
              },
              recovery_action: 'error_message_sent_to_user'
            });
            // Send error message to client
            await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                conversation_id,
                message: "Oups, un petit problème de mon côté... Tu peux réessayer ou me rappeler dans 5 min ?",
                user_id,
                // SECURITY: Pass the expected contact phone for additional validation
                expected_contact_phone: normalizedContactPhone
              }
            });
            return new Response(JSON.stringify({
              error: 'Failed to create appointment',
              details: insertError
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
          console.log('[ai-auto-reply] Appointment created successfully:', newAppointment.id);
          // Log création du rendez-vous
          await logAIEvent(supabase, user_id, conversation_id, 'appointment_created', 'Rendez-vous créé avec succès dans la base de données', {
            appointment_id: newAppointment.id,
            appointment_date: appointmentData.appointment_date,
            start_time: appointmentData.appointment_time,
            end_time: endTime,
            duration_minutes: durationMinutes,
            total_price: totalPrice,
            extras: appointmentData.selected_extras,
            status: 'confirmed'
          });

          // Send notification to provider about new appointment
          console.log('[ai-auto-reply] Sending notification to provider for new appointment');
          try {
            await supabase.functions.invoke('send-provider-notification', {
              body: {
                appointment_id: newAppointment.id,
                notification_type: 'new_appointment'
              }
            });
          } catch (notifError) {
            // Don't fail appointment creation if notification fails
            console.error('[ai-auto-reply] Failed to send provider notification:', notifError);
          }
          // Format confirmation message with backend-calculated prices
          const dateObj = new Date(appointmentData.appointment_date);
          const dayName = DAYS[dateObj.getDay()];
          const isToday = appointmentData.appointment_date === today;
          // Format date naturally: if today, don't show the full date
          const dateFormatted = isToday ? `aujourd'hui` : `${dayName} ${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
          const extrasText = appointmentData.selected_extras.length > 0 ? ` + ${appointmentData.selected_extras.map((e)=>`${e} (${extraToPriceMap[e]}€)`).join(', ')}` : '';
          const confirmationMessage = `✅ RDV confirmé !
${baseDuration} (${basePrice}€)${extrasText} = ${totalPrice}€
Aujourd'hui ${appointmentData.appointment_time}

À toute !`;
          // Send confirmation message
          const { error: sendError } = await supabase.functions.invoke('send-whatsapp-message', {
            body: {
              conversation_id,
              message: confirmationMessage,
              user_id,
              // SECURITY: Pass the expected contact phone for additional validation
              expected_contact_phone: normalizedContactPhone
            }
          });
          if (sendError) {
            console.error('[ai-auto-reply] Error sending confirmation:', sendError);
            // Log erreur d'envoi
            await logAIEvent(supabase, user_id, conversation_id, 'message_send_failed', 'Échec de l\'envoi du message de confirmation', {
              message_type: 'appointment_confirmation',
              error: sendError,
              attempted_message: confirmationMessage
            });
          } else {
            // Log envoi réussi
            await logAIEvent(supabase, user_id, conversation_id, 'message_sent', 'Message de confirmation envoyé avec succès', {
              message_type: 'appointment_confirmation',
              message_preview: confirmationMessage.substring(0, 200),
              appointment_id: newAppointment.id
            });
          }
          return new Response(JSON.stringify({
            success: true,
            appointment_created: true,
            appointment_id: newAppointment.id,
            tokens_used: openaiData.usage
          }), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        } catch (parseError) {
          console.error('[ai-auto-reply] Error parsing tool call arguments:', parseError);
          // Log erreur de parsing/création
          await logAIEvent(supabase, user_id, conversation_id, 'error_occurred', 'Erreur lors du parsing ou de la création du rendez-vous', {
            error_type: 'appointment_creation_failed',
            error_message: parseError instanceof Error ? parseError.message : String(parseError),
            error_stack: parseError instanceof Error ? parseError.stack : undefined,
            tool_call_data: toolCall.function.arguments,
            recovery_action: 'error_message_sent_to_user'
          });
          // Send error message
          await supabase.functions.invoke('send-whatsapp-message', {
            body: {
              conversation_id,
              message: "Attends, j'ai mal compris un truc. On reprend depuis le début ?",
              user_id,
              // SECURITY: Pass the expected contact phone for additional validation
              expected_contact_phone: normalizedContactPhone
            }
          });
          return new Response(JSON.stringify({
            error: 'Failed to parse appointment data',
            details: parseError instanceof Error ? parseError.message : 'Unknown error'
          }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      }
    }
    // Normal conversational response (no tool call)
    let aiResponse: string;
    let clientHasArrived = false;
    let arrivalConfidence = 'low';

    // If in WAITING mode, parse JSON structured response
    if (hasConfirmedAppointmentToday) {
      try {
        const parsedResponse = JSON.parse(messageResponse.content);
        aiResponse = parsedResponse.message;
        clientHasArrived = parsedResponse.client_has_arrived;
        arrivalConfidence = parsedResponse.confidence;

        console.log('[ai-auto-reply] Parsed JSON response:', {
          message: aiResponse,
          client_has_arrived: clientHasArrived,
          confidence: arrivalConfidence
        });
      } catch (parseError) {
        console.error('[ai-auto-reply] Failed to parse JSON response, using raw content:', parseError);
        aiResponse = messageResponse.content;
      }
    } else {
      // WORKFLOW mode: plain text response
      aiResponse = messageResponse.content;
    }

    console.log('[ai-auto-reply] Normal response:', aiResponse);

    // SECURITY: Verify conversation before sending response
    // This prevents sending messages to the wrong number if conversation was merged/changed
    const { data: conversationCheck, error: convCheckError } = await supabase
      .from('conversations')
      .select('contact_phone')
      .eq('id', conversation_id)
      .single();

    if (convCheckError || !conversationCheck) {
      console.error('[ai-auto-reply] SECURITY: Cannot verify conversation before sending:', convCheckError);
      await logAIEvent(supabase, user_id, conversation_id, 'security_check_failed', 'SÉCURITÉ: Impossible de vérifier la conversation avant envoi', {
        error: convCheckError,
        original_contact_phone: normalizedContactPhone,
        conversation_id
      });
      return new Response(JSON.stringify({
        error: 'Security check failed: conversation not found'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize the conversation's contact_phone for comparison
    const conversationPhone = normalizePhoneNumber(conversationCheck.contact_phone);

    // CRITICAL SECURITY CHECK: Ensure the conversation's phone matches the incoming message phone
    if (conversationPhone !== normalizedContactPhone) {
      console.error('[ai-auto-reply] SECURITY ALERT: Phone number mismatch detected!', {
        incoming_message_phone: normalizedContactPhone,
        conversation_phone: conversationPhone,
        conversation_id
      });

      await logAIEvent(supabase, user_id, conversation_id, 'security_violation', 'ALERTE SÉCURITÉ: Tentative d\'envoi à un numéro différent BLOQUÉE', {
        incoming_message_phone: normalizedContactPhone,
        conversation_phone: conversationPhone,
        conversation_id,
        blocked_message: aiResponse,
        severity: 'CRITICAL'
      });

      return new Response(JSON.stringify({
        error: 'Security violation: phone number mismatch',
        details: 'Message blocked to prevent sending to wrong recipient'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[ai-auto-reply] Security check passed - phone numbers match');

    // Send the AI response via send-whatsapp-message
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-whatsapp-message', {
      body: {
        conversation_id,
        message: aiResponse,
        user_id,
        // SECURITY: Pass the expected contact phone for additional validation
        expected_contact_phone: normalizedContactPhone
      }
    });
    if (sendError) {
      console.error('[ai-auto-reply] Error sending message:', sendError);
      // Log erreur d'envoi
      await logAIEvent(supabase, user_id, conversation_id, 'message_send_failed', 'Échec de l\'envoi de la réponse conversationnelle', {
        message_type: 'conversational',
        error: sendError,
        attempted_message: aiResponse
      });
      return new Response(JSON.stringify({
        error: 'Failed to send message',
        details: sendError
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('[ai-auto-reply] AI response sent successfully');
    // Log envoi réussi
    await logAIEvent(supabase, user_id, conversation_id, 'message_sent', 'Réponse conversationnelle envoyée avec succès', {
      message_type: 'conversational',
      message_content: aiResponse,
      tokens_used: openaiData.usage
    });
    // Detect client arrival if there's an appointment today (using AI context analysis)
    if (todayAppointment && !todayAppointment.client_arrived && clientHasArrived) {
      console.log('[ai-auto-reply] Client arrival detected by AI context analysis');
      console.log('[ai-auto-reply] Appointment ID:', todayAppointment.id);
      console.log('[ai-auto-reply] Message that triggered arrival detection:', message_text);
      console.log('[ai-auto-reply] AI confidence level:', arrivalConfidence);

      // Update appointment to mark client as arrived - using supabase with SERVICE_ROLE_KEY to bypass RLS
      const { data: updateData, error: updateError } = await supabase.from('appointments').update({
        client_arrived: true,
        client_arrival_detected_at: new Date().toISOString()
      }).eq('id', todayAppointment.id).select();

      if (updateError) {
        console.error('[ai-auto-reply] Failed to update client arrival status:', updateError);
        console.error('[ai-auto-reply] Update error details:', JSON.stringify(updateError, null, 2));
      } else {
        console.log('[ai-auto-reply] Successfully updated client_arrived to true');
        console.log('[ai-auto-reply] Updated appointment data:', updateData);
        // Log client arrival detection
        await logAIEvent(supabase, user_id, conversation_id, 'client_arrival_detected', 'Arrivée du client détectée automatiquement par analyse contextuelle IA', {
          appointment_id: todayAppointment.id,
          appointment_time: todayAppointment.start_time,
          message_trigger: message_text,
          detection_method: 'ai_context_analysis',
          confidence: arrivalConfidence
        });

        // Send notification to provider about client arrival
        console.log('[ai-auto-reply] Sending notification to provider for client arrival');
        try {
          await supabase.functions.invoke('send-provider-notification', {
            body: {
              appointment_id: todayAppointment.id,
              notification_type: 'client_arrived'
            }
          });
        } catch (notifError) {
          // Don't fail the flow if notification fails
          console.error('[ai-auto-reply] Failed to send client arrival notification:', notifError);
        }
      }
    }
    return new Response(JSON.stringify({
      success: true,
      response: aiResponse,
      tokens_used: openaiData.usage
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[ai-auto-reply] Error:', error);
    // Tenter de logger l'erreur même si on n'a pas tous les contextes
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      // Extraire les infos de la requête si possible
      const errorContext = {
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        error_type: error instanceof Error ? error.constructor.name : typeof error,
        timestamp: new Date().toISOString()
      };
      await logAIEvent(supabase, 'unknown', 'unknown', 'error_occurred', 'Erreur critique dans ai-auto-reply', errorContext);
    } catch (logError) {
      console.warn('[ai-auto-reply] Failed to log error:', logError);
    }
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
