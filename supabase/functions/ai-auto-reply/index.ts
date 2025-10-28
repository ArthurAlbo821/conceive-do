import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { conversation_id, user_id, message_text, contact_name, contact_phone } = await req.json();

    console.log('[ai-auto-reply] Processing auto-reply for conversation:', conversation_id);

    // Get user informations (prestations, extras, taboos, tarifs, adresse)
    const { data: userInfo, error: userInfoError } = await supabase
      .from('user_informations')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (userInfoError) {
      console.error('[ai-auto-reply] Error fetching user informations:', userInfoError);
      return new Response(JSON.stringify({ error: 'User informations not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get last 20 messages from conversation
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('direction, content, timestamp')
      .eq('conversation_id', conversation_id)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (msgError) {
      console.error('[ai-auto-reply] Error fetching messages:', msgError);
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Reverse to have chronological order (oldest first)
    const orderedMessages = messages.reverse();

    // Build context from user informations
    const prestations = Array.isArray(userInfo.prestations) 
      ? userInfo.prestations.map((p: any) => p.name || p).join(', ')
      : 'Non spécifié';
    
    const extras = Array.isArray(userInfo.extras)
      ? userInfo.extras.map((e: any) => `${e.name || e} (${e.price || 'prix non spécifié'}€)`).join(', ')
      : 'Aucun';
    
    const taboos = Array.isArray(userInfo.taboos)
      ? userInfo.taboos.map((t: any) => t.name || t).join(', ')
      : 'Aucun';
    
    const tarifs = Array.isArray(userInfo.tarifs)
      ? userInfo.tarifs.map((t: any) => `${t.duration || '?'} - ${t.price || '?'}€`).join(', ')
      : 'Non spécifié';

    const adresse = userInfo.adresse || 'Non spécifiée';

    // Build system prompt
    const systemPrompt = `Tu es un assistant virtuel professionnel qui aide à gérer les demandes de rendez-vous et à fournir des informations.

INFORMATIONS DU PROFESSIONNEL :
- Prestations disponibles : ${prestations}
- Extras disponibles : ${extras}
- Services NON proposés (à refuser poliment) : ${taboos}
- Tarifs : ${tarifs}
- Adresse : ${adresse}

INSTRUCTIONS :
1. Réponds de manière professionnelle, courtoise et naturelle
2. Fournis les informations tarifaires précises si demandées
3. Propose les extras de façon naturelle quand c'est pertinent
4. Si une demande concerne un service non proposé, refuse poliment sans jugement
5. Propose de prendre rendez-vous si la conversation l'indique
6. Réponds en français, adapte ton ton au contexte (formel ou amical selon le client)
7. Sois concis : évite de répéter des informations déjà mentionnées dans la conversation
8. Si tu ne sais pas répondre à une question, dis-le simplement

CONTEXTE : Tu as accès aux 20 derniers messages de cette conversation pour comprendre le contexte.`;

    // Build messages for OpenAI
    const conversationHistory = orderedMessages.map(msg => ({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: msg.content
    }));

    // Call OpenAI API
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[ai-auto-reply] OPENAI_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[ai-auto-reply] Calling OpenAI API with', conversationHistory.length, 'messages in history');

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[ai-auto-reply] OpenAI API error:', openaiResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'OpenAI API error', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;

    console.log('[ai-auto-reply] OpenAI response:', aiResponse);
    console.log('[ai-auto-reply] Tokens used:', openaiData.usage);

    // Send the AI response via send-whatsapp-message
    const { data: sendData, error: sendError } = await supabase.functions.invoke(
      'send-whatsapp-message',
      {
        body: {
          conversation_id,
          message: aiResponse
        }
      }
    );

    if (sendError) {
      console.error('[ai-auto-reply] Error sending message:', sendError);
      return new Response(JSON.stringify({ error: 'Failed to send message', details: sendError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[ai-auto-reply] AI response sent successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      response: aiResponse,
      tokens_used: openaiData.usage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ai-auto-reply] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
