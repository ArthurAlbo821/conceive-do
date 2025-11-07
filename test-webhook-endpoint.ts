/**
 * Script pour tester directement l'endpoint webhook de Supabase
 *
 * Ce script envoie un message de test au webhook handler pour vérifier
 * qu'il est accessible et qu'il traite correctement les messages.
 *
 * Usage:
 * deno run --allow-net --allow-env test-webhook-endpoint.ts
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://mxzvvgpqxugirbwtmxys.supabase.co';

// ⚠️ REMPLACER PAR VOTRE NOM D'INSTANCE DEPUIS LA BASE DE DONNÉES
const INSTANCE_NAME = ''; // Ex: user_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

console.log('🧪 TEST DU WEBHOOK ENDPOINT SUPABASE\n');
console.log('='.repeat(60));

async function testWebhookEndpoint() {
  if (!INSTANCE_NAME) {
    console.error('❌ ERREUR: INSTANCE_NAME non défini');
    console.log('   Veuillez modifier le script et définir INSTANCE_NAME');
    console.log('   Vous pouvez le trouver avec cette requête SQL:');
    console.log('   SELECT instance_name FROM evolution_instances WHERE user_id = \'votre_user_id\';');
    return;
  }

  console.log('📋 Configuration:');
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Instance: ${INSTANCE_NAME}`);
  console.log('');

  const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook-handler`;
  console.log(`📡 URL du webhook: ${webhookUrl}`);
  console.log('');

  // Payload de test simulant un message Evolution API
  const testPayload = {
    event: 'messages.upsert',
    instance: INSTANCE_NAME,
    data: {
      key: {
        id: 'TEST_MESSAGE_' + Date.now(),
        remoteJid: '33612345678@s.whatsapp.net', // Numéro de test
        fromMe: false,
        participant: undefined
      },
      message: {
        conversation: 'Message de test du script de diagnostic'
      },
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: 'Test Contact',
      broadcast: false,
      status: 'SERVER_ACK'
    }
  };

  console.log('📤 Envoi du message de test...');
  console.log('   Payload:', JSON.stringify(testPayload, null, 2));
  console.log('');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    console.log(`📥 Réponse du webhook:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log('');

    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
      console.log('   Réponse JSON:', JSON.stringify(responseData, null, 2));
    } catch {
      console.log('   Réponse texte:', responseText);
    }

    console.log('');

    // Analyse du résultat
    if (response.ok) {
      console.log('✅ Le webhook a répondu avec succès !');
      console.log('');
      console.log('📋 Vérifications à faire:');
      console.log('   1. Vérifiez les logs Supabase pour voir les détails du traitement');
      console.log('      Dashboard > Edge Functions > evolution-webhook-handler > Logs');
      console.log('');
      console.log('   2. Vérifiez si le message a été inséré dans la base de données:');
      console.log('      SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;');
      console.log('');
      console.log('   3. Vérifiez si une conversation a été créée:');
      console.log('      SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5;');
      console.log('');
      console.log('   4. Si rien n\'apparaît dans les logs ou la DB, le problème peut être:');
      console.log('      - L\'instance n\'existe pas dans evolution_instances');
      console.log('      - Le nom d\'instance ne correspond pas');
      console.log('      - Un problème d\'authentification');

      if (responseData?.success === false) {
        console.log('');
        console.log('⚠️  ATTENTION: Le webhook a retourné success:false');
        console.log('   Cela signifie que le webhook a rejeté le message.');
        console.log('   Raisons possibles:');
        console.log('   - Instance non trouvée dans la base de données');
        console.log('   - Problème d\'authentification');
        console.log('   - Message invalide ou incomplet');
      }
    } else {
      console.error('❌ Le webhook a retourné une erreur !');
      console.log('');

      if (response.status === 404) {
        console.log('🔍 Erreur 404 - Endpoint non trouvé');
        console.log('   Causes possibles:');
        console.log('   1. La fonction edge "evolution-webhook-handler" n\'est pas déployée');
        console.log('   2. L\'URL Supabase est incorrecte');
        console.log('   3. Le nom de la fonction est incorrect');
        console.log('');
        console.log('   Solution:');
        console.log('   cd supabase/functions');
        console.log('   supabase functions deploy evolution-webhook-handler');
      } else if (response.status === 401 || response.status === 403) {
        console.log('🔍 Erreur d\'authentification');
        console.log('   Le webhook pourrait nécessiter une authentification.');
        console.log('   Vérifiez la configuration de sécurité dans le code du webhook.');
      } else if (response.status === 500) {
        console.log('🔍 Erreur serveur (500)');
        console.log('   Une erreur s\'est produite dans le traitement du webhook.');
        console.log('   Consultez les logs Supabase pour plus de détails.');
      } else {
        console.log(`🔍 Erreur ${response.status}`);
        console.log('   Consultez les logs Supabase pour plus de détails.');
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'appel au webhook:', error.message);
    console.log('');
    console.log('🔍 Diagnostic:');
    console.log('   Causes possibles:');
    console.log('   1. Problème de connectivité réseau');
    console.log('   2. URL Supabase incorrecte');
    console.log('   3. Le service Supabase est hors ligne');
    console.log('');
    console.log('   Vérifications:');
    console.log(`   1. Testez l'accès à Supabase: curl ${SUPABASE_URL}`);
    console.log('   2. Vérifiez que la fonction edge est déployée');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Test terminé\n');
}

testWebhookEndpoint();
