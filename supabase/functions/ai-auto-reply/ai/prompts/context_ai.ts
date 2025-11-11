/**
 * AI prompt context builders
 * Builds contextual information for AI prompts based on appointment status
 */

import type { Appointment } from '../../types.ts';

/**
 * Builds appointment status context for WAITING mode
 * This context tells the AI about the current situation (client arrived, provider ready, etc.)
 * 
 * The AI uses this context to decide what message to send:
 * - If client arrived but provider not ready → Make them wait
 * - If both arrived and provider ready → Confirm access codes sent
 * - Otherwise → General waiting messages
 * 
 * @param todayAppointment - Today's confirmed appointment
 * @returns Context string to inject into system prompt
 * 
 * @example
 * const context = buildAppointmentStatusContext(todayAppointment);
 * // Returns detailed instructions based on provider_ready and client_arrived status
 */
export function buildAppointmentStatusContext(todayAppointment: Appointment): string {
  const providerReady = todayAppointment.provider_ready_to_receive;
  const clientArrived = todayAppointment.client_arrived;

  let context = `
RENDEZ-VOUS AUJOURD'HUI :
Heure : ${todayAppointment.start_time}
Client arrivé : ${clientArrived ? 'OUI' : 'NON'}
Provider prêt à recevoir : ${providerReady ? 'OUI' : 'NON'}
`;

  // Scenario 1: Client arrived but provider NOT ready
  if (!providerReady && clientArrived) {
    context += `
⚠️ SITUATION ACTUELLE : Le client est arrivé MAIS tu n'es PAS ENCORE prêt(e) !

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
- NE JAMAIS donner les codes d'accès (ils seront envoyés automatiquement quand tu seras prête)`;
  }

  // Scenario 2: Both client arrived AND provider ready
  if (providerReady && clientArrived) {
    context += `
✅ SITUATION ACTUELLE : Client arrivé et tu es prêt(e) !

Les infos d'accès (code, étage, etc.) ont déjà été envoyées automatiquement au client.
Tu peux répondre normalement à ses questions s'il en a.`;
  }

  return context;
}

/**
 * Builds minimal appointment info for logging/debugging
 * 
 * @param todayAppointment - Today's confirmed appointment
 * @returns Simple appointment info string
 */
export function buildAppointmentInfo(todayAppointment: Appointment): string {
  return `RDV ${todayAppointment.start_time} - ${todayAppointment.duration_minutes}min - ${todayAppointment.service}`;
}
