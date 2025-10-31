import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import Fuse from 'https://esm.sh/fuse.js@7.0.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Duckling API configuration
const DUCKLING_API_URL = 'https://duckling.wit.ai/parse';
async function parseDucklingEntities(text, referenceTime) {
  const refTime = referenceTime || new Date();
  const refTimeISO = refTime.toISOString();
  try {
    const response = await fetch(DUCKLING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        text: text,
        reftime: refTimeISO,
        locale: 'fr_FR',
        dims: JSON.stringify([
          'time',
          'duration'
        ])
      })
    });
    if (!response.ok) {
      console.error('[duckling] API error:', response.status);
      return [];
    }
    const entities = await response.json();
    console.log('[duckling] Parsed entities:', JSON.stringify(entities, null, 2));
    return entities;
  } catch (error) {
    console.error('[duckling] Parse error:', error);
    return [];
  }
}
function enrichMessageWithDuckling(originalMessage, entities) {
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
    console.log('[ai-auto-reply] Processing auto-reply for conversation:', conversation_id);
    console.log('[ai-auto-reply] Original message:', message_text);
    // Log réception du webhook
    await logAIEvent(supabase, user_id, conversation_id, 'webhook_received', `Message reçu de ${contact_name}`, {
      contact_name,
      contact_phone,
      message_text,
      timestamp: new Date().toISOString()
    });
    // Get current date for temporal parsing
    const now = new Date();
    // Parse temporal expressions with Duckling
    const ducklingEntities = await parseDucklingEntities(message_text, now);
    const enrichedMessage = enrichMessageWithDuckling(message_text, ducklingEntities);
    if (enrichedMessage !== message_text) {
      console.log('[ai-auto-reply] Message enriched with Duckling:', enrichedMessage);
      // Log enrichissement Duckling
      await logAIEvent(supabase, user_id, conversation_id, 'duckling_enriched', 'Expressions temporelles détectées et converties', {
        original_message: message_text,
        enriched_message: enrichedMessage,
        entities_count: ducklingEntities.length,
        entities: ducklingEntities.map((e)=>({
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
    // Get upcoming appointments (next 7 days)
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: appointments, error: apptError } = await supabase.from('appointments').select('*').eq('user_id', user_id).gte('appointment_date', today).lte('appointment_date', nextWeek).in('status', [
      'pending',
      'confirmed'
    ]).order('appointment_date, start_time');
    // Check if there's an appointment for today linked to this conversation
    const { data: todayAppointment } = await supabase.from('appointments').select('*').eq('conversation_id', conversation_id).eq('appointment_date', today).eq('status', 'confirmed').single();
    console.log('[ai-auto-reply] Found', availabilities?.length || 0, 'availabilities and', appointments?.length || 0, 'upcoming appointments');
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
      const currentDate = new Date();
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
      // Current time in minutes
      const currentMinute = currentDate.getHours() * 60 + currentDate.getMinutes();
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
          const isPast = actualMinute < currentMinute && m < 24 * 60;
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
      return `${formatTime(startH, startM)}-${formatTime(endH, endM)}`;
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

${!providerReady && clientArrived ? `⚠️ IMPORTANT : Le client est arrivé MAIS tu n'es PAS ENCORE prêt(e).
Tu DOIS faire patienter le client avec des excuses variées :
- "J'arrive dans 2 minutes, je finis de me préparer 😊"
- "Une seconde bébé, je termine un truc"
- "Attends-moi 2 min, j'arrive"
- "Je descends dans une minute"
Ne JAMAIS donner les infos d'accès (code, étage, etc.) - elles seront envoyées automatiquement quand tu seras prêt(e).` : ''}

${providerReady && clientArrived ? `✅ Client arrivé et tu es prêt(e) - Les infos d'accès ont déjà été envoyées automatiquement.` : ''}`;
    }
    // Build system prompt (optimized version)
    const systemPrompt = `Tu une escort qui gère ses RDV. Première personne, tutoiement, ton friendly/cool/complice, sans emojis.

DATE/HEURE : ${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}/${currentDateTime.year}, ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')}

TEMPS : Si "[Informations temporelles détectées: ...]" dans message client, utilise ces données parsées (fiables). Ex: "dans 30 min" → heure exacte calculée.

INFOS :
Prestations : ${prestations}
Extras : ${extras}
Taboos : ${taboos}
Tarifs : ${tarifs}
Adresse : ${adresse}

DISPO AUJOURD'HUI : ${availableRanges}${appointmentStatusContext}

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
3. HEURE : Aujourd'hui (${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}) uniquement. Toute heure APRÈS ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')} et jusqu'à 2h du matin = AUJOURD'HUI (même soirée). Format: "dans 45min", "à 20h30". Question: "À quelle heure ?" Si demain: "Désolée, que jour même."
4. CONFIRMATION : Récap court + "Je confirme ?"

WORKFLOW : Valide chaque réponse vs options. Alternatives si besoin. Pas de RDV si info manquante.

JOUR MÊME SEUL : Aujourd'hui (${currentDateTime.dayOfWeek} ${currentDateTime.date}/${currentDateTime.month}/${currentDateTime.year}) = toute heure après ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')} et dans les dispos "${availableRanges}". Ex: à ${currentDateTime.hour}h${currentDateTime.minute.toString().padStart(2, '0')}, "20h30"=OK, "demain 10h"=REFUSE. Refuse "demain", "week-end", dates futures.

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
    const openaiRequestBody = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationHistory
      ],
      temperature: 0.7,
      max_tokens: 500,
      tools: [
        appointmentTool
      ],
      tool_choice: "auto"
    };
    // Log requête OpenAI (CRUCIAL)
    const requestTimestamp = Date.now();
    await logAIEvent(supabase, user_id, conversation_id, 'ai_request_sent', 'Requête envoyée à OpenAI API', {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages_count: conversationHistory.length,
      conversation_history: conversationHistory,
      has_tools: true,
      tool_name: 'create_appointment_summary',
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
          // Insert appointment into database
          const { data: newAppointment, error: insertError } = await supabase.from('appointments').insert({
            user_id: user_id,
            conversation_id: conversation_id,
            contact_name: contact_name,
            contact_phone: contact_phone,
            appointment_date: appointmentData.appointment_date,
            start_time: appointmentData.appointment_time,
            end_time: endTime,
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
                user_id
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
              user_id
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
              user_id
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
    const aiResponse = messageResponse.content;
    console.log('[ai-auto-reply] Normal response:', aiResponse);
    // Send the AI response via send-whatsapp-message
    const { data: sendData, error: sendError } = await supabase.functions.invoke('send-whatsapp-message', {
      body: {
        conversation_id,
        message: aiResponse,
        user_id
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
    // Detect client arrival if there's an appointment today
    if (todayAppointment && !todayAppointment.client_arrived) {
      const arrivalKeywords = [
        'je suis là',
        'suis là',
        'je suis arrivé',
        'arrivé',
        'devant',
        'en bas',
        'dehors',
        'à la porte',
        'porte',
        'je suis arrivée',
        'arrivée'
      ];
      const messageTextLower = message_text.toLowerCase();
      const arrivalDetected = arrivalKeywords.some((keyword)=>messageTextLower.includes(keyword));
      if (arrivalDetected) {
        console.log('[ai-auto-reply] Client arrival detected for appointment:', todayAppointment.id);
        // Update appointment to mark client as arrived
        const { error: updateError } = await supabase.from('appointments').update({
          client_arrived: true,
          client_arrival_detected_at: new Date().toISOString()
        }).eq('id', todayAppointment.id);
        if (updateError) {
          console.error('[ai-auto-reply] Failed to update client arrival status:', updateError);
        } else {
          // Log client arrival detection
          await logAIEvent(supabase, user_id, conversation_id, 'client_arrival_detected', 'Arrivée du client détectée automatiquement', {
            appointment_id: todayAppointment.id,
            appointment_time: todayAppointment.start_time,
            message_trigger: message_text,
            keywords_matched: arrivalKeywords.filter((kw)=>messageTextLower.includes(kw))
          });
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
