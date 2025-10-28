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

    // Get current date and time context
    const now = new Date();
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

        // For each availability slot
        for (const avail of dayAvails) {
          const startHour = parseInt(avail.start_time.split(':')[0]);
          const startMinute = parseInt(avail.start_time.split(':')[1]);
          const endHour = parseInt(avail.end_time.split(':')[0]);
          const endMinute = parseInt(avail.end_time.split(':')[1]);
          
          // Check if slot crosses midnight
          const crossesMidnight = avail.end_time <= avail.start_time;
          
          // Check if there are any appointments that overlap
          const dayAppointments = appointments?.filter((apt: any) => 
            apt.appointment_date === dateStr
          ) || [];

          if (crossesMidnight) {
            // Handle slot that crosses midnight in two parts
            // Part 1: From start_time to 23:59 on current day
            for (let hour = startHour; hour < 24; hour++) {
              const slotTime = `${hour.toString().padStart(2, '0')}:00`;
              const slotEndTime = hour < 23 
                ? `${(hour + 1).toString().padStart(2, '0')}:00`
                : '23:59';

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
            
            // Part 2: From 00:00 to end_time on next day
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            const nextDateStr = nextDate.toISOString().split('T')[0];
            const nextDayOfWeek = nextDate.getDay();
            
            const nextDayAppointments = appointments?.filter((apt: any) => 
              apt.appointment_date === nextDateStr
            ) || [];
            
            for (let hour = 0; hour < endHour; hour++) {
              const slotTime = `${hour.toString().padStart(2, '0')}:00`;
              const slotEndTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

              const isOccupied = nextDayAppointments.some((apt: any) => {
                const aptStart = apt.start_time;
                const aptEnd = apt.end_time;
                return (slotTime >= aptStart && slotTime < aptEnd) || 
                       (slotEndTime > aptStart && slotEndTime <= aptEnd);
              });

              if (!isOccupied) {
                const dayName = DAYS[nextDayOfWeek];
                slots.push(`${dayName} ${nextDate.getDate()}/${nextDate.getMonth() + 1} à ${slotTime}`);
              }
            }
          } else {
            // Standard slot within same day
            for (let hour = startHour; hour < endHour; hour++) {
              const slotTime = `${hour.toString().padStart(2, '0')}:00`;
              const slotEndTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

              // Skip past slots for today
              if (i === 0) {
                const slotDateTime = new Date(date);
                slotDateTime.setHours(hour, 0, 0, 0);
                if (slotDateTime < now) {
                  continue;
                }
              }

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
      }

      return slots.length > 0 
        ? slots.slice(0, 10).join('\n- ') // Limit to 10 slots
        : "Aucun créneau disponible cette semaine. Propose au client de rappeler plus tard ou de se mettre en liste d'attente.";
    };

    const availableSlots = computeAvailableSlots();

    // Define appointment tool for structured data collection
    const appointmentTool = {
      type: "function",
      function: {
        name: "create_appointment_summary",
        description: "Crée un résumé de rendez-vous avec toutes les informations collectées. N'utilise cette fonction QUE lorsque tu as obtenu TOUTES les 4 informations obligatoires ET que le client a confirmé.",
        parameters: {
          type: "object",
          properties: {
            duration_minutes: {
              type: "integer",
              description: "Durée du rendez-vous en minutes (ex: 30, 60, 90)"
            },
            selected_extras: {
              type: "array",
              items: { type: "string" },
              description: "Liste des extras sélectionnés par le client (noms exacts)"
            },
            appointment_date: {
              type: "string",
              description: "Date du rendez-vous au format YYYY-MM-DD (ex: 2024-03-15)"
            },
            appointment_time: {
              type: "string",
              description: "Heure de début du rendez-vous au format HH:MM (ex: 14:00)"
            },
            total_price: {
              type: "number",
              description: "Prix total calculé (tarif de base + extras)"
            }
          },
          required: ["duration_minutes", "selected_extras", "appointment_date", "appointment_time", "total_price"]
        }
      }
    };

    // Build system prompt
    const systemPrompt = `Tu es un assistant virtuel professionnel qui aide à gérer les demandes de rendez-vous et à fournir des informations.

DATE ET HEURE ACTUELLES :
- Nous sommes le : ${currentDateTime.fullDate}
- Il est actuellement : ${currentDateTime.time}
- Jour de la semaine : ${currentDateTime.dayOfWeek}
- Date complète : ${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}/${currentDateTime.year}
- Heure : ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')}

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

INSTRUCTIONS GÉNÉRALES :
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
12. GESTION DU TEMPS : Utilise la date et l'heure actuelles pour répondre aux questions temporelles
    - "dans 30 min" = calcule à partir de l'heure actuelle
    - "cet après-midi" = aujourd'hui entre 14h et 18h
    - "ce soir" = aujourd'hui après 18h
    - "demain matin" = jour suivant avant 12h
    - "demain après-midi" = jour suivant entre 14h et 18h
13. Pour les demandes urgentes (dans moins d'une heure), vérifie si c'est réaliste avec les disponibilités
14. Si un créneau demandé est déjà passé (dans le passé), propose poliment les prochains créneaux disponibles

PROCESSUS DE PRISE DE RENDEZ-VOUS (CRITIQUE) :
Pour créer un rendez-vous, tu DOIS collecter ces 4 INFORMATIONS OBLIGATOIRES :
1. 📅 DATE ET HEURE : Le créneau exact parmi ceux disponibles
2. ⏱️ DURÉE : Combien de temps (30min, 1h, 1h30, etc.)
3. ➕ EXTRAS : Est-ce que le client veut ajouter des extras ? (pose la question explicitement)
4. ✅ CONFIRMATION : Le client confirme explicitement qu'il est d'accord

RÈGLES DE COLLECTE :
- Pose UNE SEULE question à la fois, ne submerge pas le client
- Après chaque réponse du client, analyse ce qu'il manque encore
- NE crée PAS de rendez-vous tant qu'il manque une information
- Une fois TOUTES les infos collectées, présente un résumé clair :
  "Parfait ! Je récapitule votre rendez-vous :
  📅 [Jour] [Date] à [Heure]
  ⏱️ Durée : [X] minutes
  ➕ Extras : [Liste ou "Aucun"]
  💰 Prix total : [Prix]€
  
  Confirmez-vous ce rendez-vous ?"

- Attends la confirmation explicite du client (oui, ok, confirme, d'accord, etc.)
- UNIQUEMENT après confirmation, utilise la fonction create_appointment_summary avec les données exactes

EXEMPLE DE CONVERSATION :
Client: "Je voudrais un rendez-vous demain"
Assistant: "Avec plaisir ! Demain j'ai ces créneaux disponibles : 14h, 16h, 18h. Quelle heure vous conviendrait ?"
Client: "14h c'est parfait"
Assistant: "Très bien ! Pour la durée, préférez-vous 30 minutes (50€) ou 1 heure (80€) ?"
Client: "1 heure"
Assistant: "Parfait ! Souhaitez-vous ajouter des extras ? J'ai par exemple [liste extras avec prix]"
Client: "Oui, [extra X]"
Assistant: "Excellent ! Je récapitule : Demain [date] à 14h, 1 heure avec [extra X]. Prix total : 95€. Je confirme ?"
Client: "Oui"
[Utilise create_appointment_summary avec toutes les données]

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
        max_tokens: 500,
        tools: [appointmentTool],
        tool_choice: "auto"
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
    const messageResponse = openaiData.choices[0].message;
    const finishReason = openaiData.choices[0].finish_reason;

    console.log('[ai-auto-reply] OpenAI finish_reason:', finishReason);
    console.log('[ai-auto-reply] Tokens used:', openaiData.usage);

    // Check if AI wants to create an appointment (tool call)
    if (finishReason === 'tool_calls' && messageResponse.tool_calls) {
      const toolCall = messageResponse.tool_calls[0];
      
      if (toolCall.function.name === 'create_appointment_summary') {
        console.log('[ai-auto-reply] Tool call detected - creating appointment');
        
        try {
          const appointmentData = JSON.parse(toolCall.function.arguments);
          console.log('[ai-auto-reply] Appointment data:', appointmentData);

          // Calculate end_time from start_time + duration
          const [hours, minutes] = appointmentData.appointment_time.split(':').map(Number);
          const totalMinutes = hours * 60 + minutes + appointmentData.duration_minutes;
          const endHours = Math.floor(totalMinutes / 60) % 24;
          const endMinutes = totalMinutes % 60;
          const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;

          // Insert appointment into database
          const { data: newAppointment, error: insertError } = await supabase
            .from('appointments')
            .insert({
              user_id: user_id,
              conversation_id: conversation_id,
              contact_name: contact_name,
              contact_phone: contact_phone,
              appointment_date: appointmentData.appointment_date,
              start_time: appointmentData.appointment_time,
              end_time: endTime,
              duration_minutes: appointmentData.duration_minutes,
              service: prestations, // Main service
              notes: appointmentData.selected_extras.length > 0 
                ? `Extras: ${appointmentData.selected_extras.join(', ')}`
                : null,
              status: 'confirmed'
            })
            .select()
            .single();

          if (insertError) {
            console.error('[ai-auto-reply] Error inserting appointment:', insertError);
            
            // Send error message to client
            await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                conversation_id,
                message: "Désolé, une erreur s'est produite lors de la création de votre rendez-vous. Veuillez réessayer ou me contacter directement.",
                user_id
              }
            });

            return new Response(JSON.stringify({ 
              error: 'Failed to create appointment', 
              details: insertError 
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          console.log('[ai-auto-reply] Appointment created successfully:', newAppointment.id);

          // Format confirmation message
          const dateObj = new Date(appointmentData.appointment_date);
          const dayName = DAYS[dateObj.getDay()];
          const dateFormatted = `${dayName} ${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
          
          const extrasText = appointmentData.selected_extras.length > 0
            ? `\n➕ Extras : ${appointmentData.selected_extras.join(', ')}`
            : '';

          const confirmationMessage = `✅ *Rendez-vous confirmé !*

📅 Date : ${dateFormatted}
🕐 Heure : ${appointmentData.appointment_time}
⏱️ Durée : ${appointmentData.duration_minutes} minutes${extrasText}
💰 Prix total : ${appointmentData.total_price}€

Merci pour votre confiance ! Je vous attends à cette date. Si vous avez besoin de modifier ou annuler, n'hésitez pas à me contacter.`;

          // Send confirmation message
          const { error: sendError } = await supabase.functions.invoke('send-whatsapp-message', {
            body: {
              conversation_id,
              message: confirmationMessage,
              user_id
            }
          });

          if (sendError) {
            console.error('[ai-auto-reply] Error sending confirmation:', sendError);
          }

          return new Response(JSON.stringify({ 
            success: true,
            appointment_created: true,
            appointment_id: newAppointment.id,
            tokens_used: openaiData.usage
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } catch (parseError) {
          console.error('[ai-auto-reply] Error parsing tool call arguments:', parseError);
          
          // Send error message
          await supabase.functions.invoke('send-whatsapp-message', {
            body: {
              conversation_id,
              message: "Désolé, je n'ai pas pu valider toutes les informations du rendez-vous. Pouvons-nous reprendre depuis le début ?",
              user_id
            }
          });

          return new Response(JSON.stringify({ 
            error: 'Failed to parse appointment data',
            details: parseError instanceof Error ? parseError.message : 'Unknown error'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Normal conversational response (no tool call)
    const aiResponse = messageResponse.content;
    console.log('[ai-auto-reply] Normal response:', aiResponse);

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
