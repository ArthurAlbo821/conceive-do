import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import Fuse from 'https://esm.sh/fuse.js@7.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Duckling API configuration
const DUCKLING_API_URL = 'https://duckling.wit.ai/parse';

interface DucklingEntity {
  body: string;
  start: number;
  end: number;
  dim: string;
  latent: boolean;
  value: {
    type?: string;
    value?: string;
    grain?: string;
    values?: Array<{
      value?: string;
      type?: string;
      from?: { value: string };
      to?: { value: string };
    }>;
  };
}

interface SemanticMatch {
  match: any | null;
  confidence: number;
  alternatives: any[];
}

async function parseDucklingEntities(text: string, referenceTime?: Date): Promise<DucklingEntity[]> {
  const refTime = referenceTime || new Date();
  const refTimeISO = refTime.toISOString();
  
  try {
    const response = await fetch(DUCKLING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: text,
        reftime: refTimeISO,
        locale: 'fr_FR',
        dims: JSON.stringify(['time', 'duration']),
      }),
    });

    if (!response.ok) {
      console.error('[duckling] API error:', response.status);
      return [];
    }

    const entities: DucklingEntity[] = await response.json();
    console.log('[duckling] Parsed entities:', JSON.stringify(entities, null, 2));
    
    return entities;
  } catch (error) {
    console.error('[duckling] Parse error:', error);
    return [];
  }
}

function enrichMessageWithDuckling(originalMessage: string, entities: DucklingEntity[]): string {
  if (entities.length === 0) return originalMessage;
  
  let enrichedMessage = originalMessage;
  const timeEntities = entities.filter(e => e.dim === 'time' && e.value.value);
  
  if (timeEntities.length > 0) {
    enrichedMessage += '\n\n[Informations temporelles détectées:';
    
    for (const entity of timeEntities) {
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

/**
 * Semantic Matching dynamique - créé un nouvel index pour chaque user
 * Permet de matcher les intentions du client avec le catalogue spécifique du user
 */
function findBestSemanticMatch(
  clientMessage: string,
  catalog: any[],
  searchKeys: string[] = ['name', 'description', 'keywords']
): SemanticMatch {
  if (!catalog || catalog.length === 0) {
    return { match: null, confidence: 0, alternatives: [] };
  }

  // Créer un nouvel index Fuse.js avec le catalogue du user
  const fuse = new Fuse(catalog, {
    keys: searchKeys,
    threshold: 0.4, // 0 = match parfait, 1 = tout matche
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    useExtendedSearch: false
  });

  const results = fuse.search(clientMessage);
  
  if (results.length === 0) {
    return { match: null, confidence: 0, alternatives: [] };
  }

  const bestMatch = results[0];
  // Inverser le score (Fuse retourne 0 = meilleur)
  const confidence = 1 - (bestMatch.score || 0);
  
  console.log('[semantic-match] Best match:', {
    query: clientMessage,
    match: bestMatch.item.name || bestMatch.item,
    confidence: confidence.toFixed(2),
    alternatives: results.slice(1, 4).map(r => r.item.name || r.item)
  });
  
  return {
    match: bestMatch.item,
    confidence,
    alternatives: results.slice(1, 4).map(r => r.item)
  };
}

/**
 * Log les tentatives d'hallucination pour monitoring
 */
async function logHallucinationAttempt(
  supabase: any,
  userId: string,
  conversationId: string,
  eventType: string,
  attemptedValue: string,
  validOptions: string[],
  clientMessage: string
) {
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
    console.log('[ai-auto-reply] Original message:', message_text);

    // Get current date for temporal parsing
    const now = new Date();

    // Parse temporal expressions with Duckling
    const ducklingEntities = await parseDucklingEntities(message_text, now);
    const enrichedMessage = enrichMessageWithDuckling(message_text, ducklingEntities);

    if (enrichedMessage !== message_text) {
      console.log('[ai-auto-reply] Message enriched with Duckling:', enrichedMessage);
    }

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

    console.log('[ai-auto-reply] User catalog loaded:', {
      prestations: userInfo.prestations?.length || 0,
      extras: userInfo.extras?.length || 0,
      tarifs: userInfo.tarifs?.length || 0
    });

    // Format availabilities for AI
    const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const availabilityText = availabilities && availabilities.length > 0
      ? availabilities.map((a: any) => 
          `${DAYS[a.day_of_week]} : ${a.start_time} - ${a.end_time}`
        ).join('\n- ')
      : 'Aucune disponibilité configurée';

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

    // Build dynamic enums from user data for strict validation
    const prestationNames = Array.isArray(userInfo.prestations) 
      ? userInfo.prestations.map((p: any) => p.name)
      : [];

    const extraOptions = Array.isArray(userInfo.extras)
      ? userInfo.extras.map((e: any) => ({
          name: e.name,
          price: e.price
        }))
      : [];

    const tarifOptions = Array.isArray(userInfo.tarifs)
      ? userInfo.tarifs.map((t: any) => ({
          duration: t.duration,
          price: t.price
        }))
      : [];

    // Create enum arrays for strict validation
    const prestationEnum = prestationNames;
    const extraEnum = extraOptions.map((e: any) => e.name);
    const durationEnum = tarifOptions.map((t: any) => t.duration);

    // Create price mappings for backend validation
    const durationToPriceMap = Object.fromEntries(
      tarifOptions.map((t: any) => [t.duration, t.price])
    );
    const extraToPriceMap = Object.fromEntries(
      extraOptions.map((e: any) => [e.name, e.price])
    );

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
        description: "Crée un résumé de rendez-vous avec toutes les informations collectées. N'utilise cette fonction QUE lorsque tu as obtenu TOUTES les 5 informations obligatoires ET que le client a confirmé.",
        parameters: {
          type: "object",
          properties: {
            prestation: {
              type: "string",
              enum: prestationEnum.length > 0 ? prestationEnum : ["default"],
              description: "La prestation choisie parmi celles disponibles"
            },
            duration: {
              type: "string",
              enum: durationEnum.length > 0 ? durationEnum : ["30min"],
              description: "Durée du rendez-vous (format: '30min', '1h', etc.)"
            },
            selected_extras: {
              type: "array",
              items: {
                type: "string",
                enum: extraEnum.length > 0 ? extraEnum : ["aucun"]
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
          required: ["prestation", "duration", "selected_extras", "appointment_date", "appointment_time"],
          additionalProperties: false
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

INTERPRÉTATION TEMPORELLE :
- Les messages clients peuvent contenir des informations temporelles enrichies entre crochets [...]
- Ces informations sont extraites automatiquement via Duckling et sont FIABLES
- Utilise-les en priorité pour comprendre les demandes temporelles du client
- Si tu vois "[Informations temporelles détectées: ...]", cela signifie que le parsing temporel a déjà été fait
- Exemples : "dans 30 min" sera converti en date/heure exacte, "demain à 14h" sera parsé avec la date complète
- Ces extractions sont plus fiables que l'interprétation manuelle, privilégie-les toujours

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
Pour créer un rendez-vous, tu DOIS collecter ces 5 INFORMATIONS OBLIGATOIRES :

1. 🎯 PRESTATION : Quelle prestation souhaite le client ?
   → Prestations disponibles : ${prestationEnum.length > 0 ? prestationEnum.join(', ') : 'Non configuré'}
   → Tu DOIS choisir parmi cette liste UNIQUEMENT

2. ⏱️ DURÉE : Quelle durée de rendez-vous ?
   → Durées disponibles : ${durationEnum.length > 0 ? durationEnum.join(', ') : 'Non configuré'}
   → Tarifs correspondants : ${tarifOptions.length > 0 ? tarifOptions.map((t: any) => `${t.duration} = ${t.price}€`).join(', ') : 'Non configuré'}

3. ➕ EXTRAS : Est-ce que le client veut des extras ?
   → Extras disponibles : ${extraEnum.length > 0 ? extraEnum.map((e: string) => {
       const price = extraToPriceMap[e];
       return `${e} (+${price}€)`;
     }).join(', ') : 'Aucun extra disponible'}
   → Le client peut ne rien choisir (extras = [])

4. 📅 DATE ET HEURE : Le créneau exact parmi ceux disponibles
   → Créneaux disponibles : voir la liste ci-dessus

5. ✅ CONFIRMATION : Le client confirme explicitement qu'il est d'accord

RÈGLES DE COLLECTE :
- Pose UNE SEULE question à la fois
- Vérifie que chaque réponse correspond EXACTEMENT aux options disponibles
- Si le client demande quelque chose qui n'existe pas, propose des alternatives parmi les options disponibles
- NE crée PAS de rendez-vous tant qu'il manque une information
- Calcule automatiquement le prix total : prix_base + somme(prix_extras)
- Présente un résumé clair avec le prix total calculé
- Attends la confirmation explicite avant d'appeler create_appointment_summary

SEMANTIC MATCHING :
- Si le client dit "un massage" → comprends "${prestationEnum[0] || 'Massage'}" (si c'est l'option disponible)
- Si le client dit "30 minutes" ou "une demi-heure" → comprends "30min"
- Si le client dit "1 heure" ou "60 minutes" → comprends "1h"
- Si le client mentionne un extra de manière approximative → match avec l'option disponible la plus proche

EXEMPLE DE RÉSUMÉ :
"Parfait ! Je récapitule votre rendez-vous :
🎯 Prestation : [Prestation]
⏱️ Durée : [Duration] ([Prix base]€)
➕ Extras : [Liste] (+[Prix extras]€)
📅 [Jour] [Date] à [Heure]
💰 Prix total : [Total]€

Confirmez-vous ce rendez-vous ?"

EXEMPLE DE CONVERSATION :
Client: "Je voudrais un rendez-vous demain"
Assistant: "Avec plaisir ! Quelle prestation vous intéresse ? J'ai : ${prestationEnum.join(', ')}"
Client: "Un massage"
Assistant: "Très bien ! Demain j'ai ces créneaux disponibles : 14h, 16h, 18h. Quelle heure vous conviendrait ?"
Client: "14h"
Assistant: "Parfait ! Quelle durée préférez-vous ? ${durationEnum.join(' ou ')}"
Client: "1h"
Assistant: "Excellent ! Souhaitez-vous ajouter des extras ? ${extraEnum.length > 0 ? 'J\'ai : ' + extraEnum.join(', ') : 'Je n\'ai pas d\'extras pour le moment'}"
Client: "Non merci"
Assistant: "Très bien ! Récapitulatif : ${prestationEnum[0] || 'Prestation'}, 1h (${durationToPriceMap['1h'] || '?'}€), demain à 14h. Prix total : ${durationToPriceMap['1h'] || '?'}€. Je confirme ?"
Client: "Oui"
[Utilise create_appointment_summary avec : prestation="${prestationEnum[0]}", duration="1h", selected_extras=[], date=demain, time="14:00"]

CONTEXTE : Tu as accès aux 20 derniers messages de cette conversation pour comprendre le contexte.`;

    // Build messages for OpenAI
    const conversationHistory = orderedMessages.map((msg, index) => {
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
          console.log('[ai-auto-reply] Appointment data from AI:', appointmentData);

          // Security check: Validate all enum values to prevent hallucinations
          const validPrestation = prestationEnum.includes(appointmentData.prestation);
          const validDuration = durationEnum.includes(appointmentData.duration);
          const validExtras = appointmentData.selected_extras.every((e: string) => extraEnum.includes(e));

          if (!validPrestation || !validDuration || !validExtras) {
            console.error('[ai-auto-reply] Invalid enum values detected!', {
              prestation: appointmentData.prestation,
              valid: validPrestation,
              duration: appointmentData.duration,
              validDuration: validDuration,
              extras: appointmentData.selected_extras,
              validExtras: validExtras
            });

            // Log l'hallucination pour monitoring
            if (!validPrestation) {
              await logHallucinationAttempt(
                supabase, user_id, conversation_id,
                'invalid_prestation',
                appointmentData.prestation,
                prestationEnum,
                message_text
              );
            }
            
            // SEMANTIC MATCHING FALLBACK - Essayer de récupérer l'intention
            console.log('[ai-auto-reply] Attempting semantic matching fallback...');
            
            // 1. Essayer de matcher la prestation
            if (!validPrestation) {
              const prestationMatch = findBestSemanticMatch(
                message_text,
                userInfo.prestations,
                ['name', 'description', 'keywords']
              );

              if (prestationMatch.confidence > 0.65) {
                console.log('[ai-auto-reply] Good semantic match found for prestation!');
                
                // Construire le message de clarification avec options
                const options = [
                  prestationMatch.match.name,
                  ...prestationMatch.alternatives.map((a: any) => a.name)
                ].filter(Boolean);
                
                const optionsText = options
                  .slice(0, 3) // Max 3 options
                  .map((opt, i) => `${i + 1}. ${opt}`)
                  .join('\n');
                
                const clarificationMessage = `Je ne suis pas sûr de bien comprendre. Souhaitez-vous :\n\n${optionsText}\n\nRépondez avec le numéro ou le nom de la prestation.`;
                
                await supabase.functions.invoke('send-whatsapp-message', {
                  body: { conversation_id, message: clarificationMessage, user_id }
                });
                
                return new Response(JSON.stringify({ 
                  success: true,
                  needs_clarification: true,
                  semantic_match: prestationMatch.match.name,
                  confidence: prestationMatch.confidence
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              } else {
                // Confiance trop faible, lister toutes les options
                console.log('[ai-auto-reply] Low confidence, listing all options');
                
                const allPrestations = prestationEnum.map((p, i) => `${i + 1}. ${p}`).join('\n');
                const fallbackMessage = `Je ne suis pas sûr de comprendre quelle prestation vous souhaitez. Voici ce que je propose :\n\n${allPrestations}\n\nQuelle prestation vous intéresse ?`;
                
                await supabase.functions.invoke('send-whatsapp-message', {
                  body: { conversation_id, message: fallbackMessage, user_id }
                });
                
                return new Response(JSON.stringify({ 
                  success: true,
                  needs_full_clarification: true
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            }
            
            // Si validation échoue sans fallback possible
            throw new Error('Invalid prestation, duration, or extras selected');
          }

          // Calculate prices from backend data (not from AI)
          const baseDuration = appointmentData.duration; // e.g., "30min" or "1h"
          const basePrice = durationToPriceMap[baseDuration];
          
          if (!basePrice) {
            throw new Error(`Invalid duration: ${baseDuration}`);
          }

          // Calculate extras total
          const extrasTotal = appointmentData.selected_extras.reduce((sum: number, extraName: string) => {
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

          // Convert duration string to minutes
          let durationMinutes: number;
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
              duration_minutes: durationMinutes,
              service: appointmentData.prestation, // Store the exact prestation name
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

          // Format confirmation message with backend-calculated prices
          const dateObj = new Date(appointmentData.appointment_date);
          const dayName = DAYS[dateObj.getDay()];
          const dateFormatted = `${dayName} ${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
          
          const extrasText = appointmentData.selected_extras.length > 0
            ? `\n➕ Extras : ${appointmentData.selected_extras.map((e: string) => 
                `${e} (+${extraToPriceMap[e]}€)`
              ).join(', ')}`
            : '';

          const confirmationMessage = `✅ *Rendez-vous confirmé !*

🎯 Prestation : ${appointmentData.prestation}
📅 Date : ${dateFormatted}
🕐 Heure : ${appointmentData.appointment_time} - ${endTime}
⏱️ Durée : ${baseDuration} (${basePrice}€)${extrasText}
💰 Prix total : ${totalPrice}€

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