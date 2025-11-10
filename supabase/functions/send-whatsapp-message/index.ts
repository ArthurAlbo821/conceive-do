import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { normalizePhoneNumber, arePhoneNumbersEqual } from '../_shared/normalize-phone.ts';
import { storeMessageInSupermemory } from '../_shared/supermemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Récupérer le user_id depuis le body ou depuis le token
    const bodyData = await req.json();
    const { conversation_id, message, user_id: providedUserId, expected_contact_phone } = bodyData;

    let userId: string;

    if (providedUserId) {
      // Appel interne depuis une autre edge function
      userId = providedUserId;
      console.log('[send-message] Internal call with user_id:', userId);
    } else {
      // Appel depuis le frontend - vérifier le token
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('Missing authorization');
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        throw new Error('Unauthorized');
      }
      userId = user.id;
    }

    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Récupérer la conversation avec l'instance
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        instance:evolution_instances(*)
      `)
      .eq('id', conversation_id)
      .eq('user_id', userId)
      .single();

    if (convError || !conversation) {
      console.error('[send-message] Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL SECURITY CHECK: Verify the phone number matches the expected recipient
    if (expected_contact_phone) {
      const conversationPhone = normalizePhoneNumber(conversation.contact_phone);
      const expectedPhone = normalizePhoneNumber(expected_contact_phone);

      if (conversationPhone !== expectedPhone) {
        console.error('[send-message] SECURITY VIOLATION: Phone number mismatch detected!', {
          conversation_id,
          conversation_phone: conversationPhone,
          expected_phone: expectedPhone,
          message_preview: message.substring(0, 100)
        });

        // Log to database for security audit
        await supabase.from('ai_logs').insert({
          user_id: userId,
          conversation_id: conversation_id,
          event_type: 'security_violation_send',
          message: 'ALERTE SÉCURITÉ CRITIQUE: Tentative d\'envoi à un numéro différent BLOQUÉE dans send-whatsapp-message',
          valid_options: {
            conversation_phone: conversationPhone,
            expected_phone: expectedPhone,
            conversation_id,
            blocked_message: message.substring(0, 500),
            severity: 'CRITICAL',
            timestamp: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        });

        return new Response(JSON.stringify({
          error: 'Security violation: Phone number mismatch',
          details: 'The conversation recipient does not match the expected phone number. Message blocked to prevent sending to wrong recipient.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[send-message] Security check passed - phone numbers match:', conversationPhone);
    } else {
      // If no expected_contact_phone is provided, log a warning
      console.warn('[send-message] WARNING: No expected_contact_phone provided for security validation');
    }

    const instance = conversation.instance;

    if (!instance || instance.instance_status !== 'connected') {
      return new Response(JSON.stringify({ error: 'WhatsApp instance not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Envoyer via Evolution API
    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
    const evolutionUrl = `${baseUrl}/message/sendText/${instance.instance_name}`;
    console.log(`[send-message] Sending to ${conversation.contact_phone}`);

    const evolutionResponse = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('EVOLUTION_API_KEY') ?? '',
      },
      body: JSON.stringify({
        number: `${conversation.contact_phone}@s.whatsapp.net`,
        text: message,
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('[send-message] Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${evolutionResponse.statusText}`);
    }

    const responseData = await evolutionResponse.json();
    console.log('[send-message] Evolution response:', responseData);

    // Stocker le message dans la DB
    const sentAt = new Date().toISOString();
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        instance_id: instance.id,
        sender_phone: instance.phone_number,
        receiver_phone: conversation.contact_phone,
        direction: 'outgoing',
        content: message,
        status: 'sent',
        timestamp: sentAt,
      });

    if (msgError) {
      console.error('[send-message] Error storing message:', msgError);
      throw msgError;
    }

    try {
      await storeMessageInSupermemory({
        userId,
        conversationId: conversation.id,
        role: 'assistant',
        content: message,
        timestamp: sentAt,
        metadata: {
          source: 'send-whatsapp-message',
          evolution_message_id: responseData?.key?.id ?? null,
        },
      });
    } catch (supermemoryError) {
      console.warn('[send-message] Failed to sync message with Supermemory:', supermemoryError);
    }

    // Mettre à jour la conversation
    await supabase
      .from('conversations')
      .update({
        last_message_text: message,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    console.log('[send-message] Message sent successfully');

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-message] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
