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

    // Get availabilities
    const { data: availabilities, error: availError } = await supabase
      .from('availabilities')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .order('day_of_week, start_time');

    // Get upcoming appointments (next 7 days)
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    
    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', user_id)
      .gte('appointment_date', today)
      .lte('appointment_date', nextWeek)
      .in('status', ['pending', 'confirmed'])
      .order('appointment_date, start_time');

    console.log('[ai-auto-reply] Found', availabilities?.length || 0, 'availabilities and', appointments?.length || 0, 'upcoming appointments');

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

    // Format availabilities for AI
    const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const availabilityText = availabilities && availabilities.length > 0
      ? availabilities.map((a: any) => 
          `${DAYS[a.day_of_week]} : ${a.start_time} - ${a.end_time}`
        ).join('\n- ')
      : 'Aucune disponibilité configurée';

    // Compute available slots
    const computeAvailableSlots = () => {
      if (!availabilities || availabilities.length === 0) {
        return "Aucune disponibilité configurée. Demande au client de te contacter directement pour fixer un rendez-vous.";
      }

      const slots: string[] = [];
      const currentDate = new Date();

      // For next 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        // Find availabilities for this day
        const dayAvails = availabilities.filter((a: any) => a.day_of_week === dayOfWeek);

        if (dayAvails.length === 0) continue;

        // For each availability slot
        for (const avail of dayAvails) {
          // Check if there are any appointments that overlap
          const dayAppointments = appointments?.filter((apt: any) => 
            apt.appointment_date === dateStr
          ) || [];

          const startHour = parseInt(avail.start_time.split(':')[0]);
          const startMinute = parseInt(avail.start_time.split(':')[1]);
          const endHour = parseInt(avail.end_time.split(':')[0]);
          const endMinute = parseInt(avail.end_time.split(':')[1]);

          // Generate hourly slots
          for (let hour = startHour; hour < endHour; hour++) {
            const slotTime = `${hour.toString().padStart(2, '0')}:00`;
            const slotEndTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

            // Check if slot is free
            const isOccupied = dayAppointments.some((apt: any) => {
              const aptStart = apt.start_time;
              const aptEnd = apt.end_time;
              return (slotTime >= aptStart && slotTime < aptEnd) || 
                     (slotEndTime > aptStart && slotEndTime <= aptEnd);
            });

            if (!isOccupied) {
              const dayName = DAYS[dayOfWeek];
              slots.push(`${dayName} ${date.getDate()}/${date.getMonth() + 1} à ${slotTime}`);
            }
          }
        }
      }

      return slots.length > 0 
        ? slots.slice(0, 10).join('\n- ') // Limit to 10 slots
        : "Aucun créneau disponible cette semaine. Propose au client de rappeler plus tard ou de se mettre en liste d'attente.";
    };

    const availableSlots = computeAvailableSlots();

    // Build system prompt
    const systemPrompt = `Tu es un assistant virtuel professionnel qui aide à gérer les demandes de rendez-vous et à fournir des informations.

INFORMATIONS DU PROFESSIONNEL :
- Prestations disponibles : ${prestations}
- Extras disponibles : ${extras}
- Services NON proposés (à refuser poliment) : ${taboos}
- Tarifs : ${tarifs}
- Adresse : ${adresse}

DISPONIBILITÉS HEBDOMADAIRES :
- ${availabilityText}

CRÉNEAUX DISPONIBLES (7 prochains jours) :
- ${availableSlots}

INSTRUCTIONS :
1. Réponds de manière professionnelle, courtoise et naturelle
2. Fournis les informations tarifaires précises si demandées
3. Propose les extras de façon naturelle quand c'est pertinent
4. Si une demande concerne un service non proposé, refuse poliment sans jugement
5. IMPORTANT : Si un client demande un rendez-vous, propose UNIQUEMENT les créneaux disponibles listés ci-dessus
6. Si aucun créneau n'est disponible, propose de rappeler ultérieurement ou de se mettre en liste d'attente
7. Quand tu proposes des créneaux, sois précis (jour + date + heure exacte)
8. Ne propose JAMAIS de créneaux en dehors des horaires et disponibilités indiqués
9. Réponds en français, adapte ton ton au contexte (formel ou amical selon le client)
10. Sois concis : évite de répéter des informations déjà mentionnées dans la conversation
11. Si tu ne sais pas répondre à une question, dis-le simplement

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
          message: aiResponse,
          user_id
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
