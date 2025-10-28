import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

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

    // Authentification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { conversation_id, message } = await req.json();

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
      .eq('user_id', user.id)
      .single();

    if (convError || !conversation) {
      console.error('[send-message] Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        timestamp: new Date().toISOString(),
      });

    if (msgError) {
      console.error('[send-message] Error storing message:', msgError);
      throw msgError;
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
