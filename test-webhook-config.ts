/**
 * Script de diagnostic pour tester la configuration du webhook Evolution API
 *
 * Ce script vérifie :
 * 1. La connectivité à l'API Evolution
 * 2. L'existence de l'instance
 * 3. La configuration du webhook
 * 4. Les événements configurés
 */

// Pour utiliser ce script :
// 1. Installez Deno si ce n'est pas déjà fait : https://deno.land/
// 2. Configurez les variables ci-dessous avec vos valeurs
// 3. Exécutez : deno run --allow-net --allow-env test-webhook-config.ts

const EVOLUTION_API_BASE_URL = Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://evo.voxium.cloud';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || '';

// ⚠️ REMPLACER PAR VOTRE NOM D'INSTANCE ET TOKEN DEPUIS LA BASE DE DONNÉES
const INSTANCE_NAME = ''; // Ex: user_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const INSTANCE_TOKEN = ''; // Token depuis la table evolution_instances

console.log('🔍 DIAGNOSTIC DE CONFIGURATION WEBHOOK\n');
console.log('='.repeat(60));

async function testWebhookConfig() {
  if (!INSTANCE_NAME) {
    console.error('❌ ERREUR: INSTANCE_NAME non défini');
    console.log('   Veuillez modifier le script et définir INSTANCE_NAME');
    return;
  }

  if (!INSTANCE_TOKEN) {
    console.error('❌ ERREUR: INSTANCE_TOKEN non défini');
    console.log('   Veuillez modifier le script et définir INSTANCE_TOKEN');
    return;
  }

  console.log('📋 Configuration:');
  console.log(`   Evolution API: ${EVOLUTION_API_BASE_URL}`);
  console.log(`   Instance: ${INSTANCE_NAME}`);
  console.log(`   API Key: ${EVOLUTION_API_KEY ? '✅ Présent' : '❌ Manquant'}`);
  console.log(`   Instance Token: ${INSTANCE_TOKEN ? '✅ Présent' : '❌ Manquant'}`);
  console.log('');

  // Test 1: Vérifier l'état de connexion de l'instance
  console.log('1️⃣ Test de connexion de l\'instance...');
  try {
    const connectionResponse = await fetch(
      `${EVOLUTION_API_BASE_URL}/instance/connectionState/${INSTANCE_NAME}`,
      {
        method: 'GET',
        headers: {
          'apikey': INSTANCE_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (connectionResponse.ok) {
      const connectionData = await connectionResponse.json();
      console.log('   ✅ Instance trouvée');
      console.log('   État:', JSON.stringify(connectionData, null, 2));
    } else {
      console.error(`   ❌ Erreur: ${connectionResponse.status} ${connectionResponse.statusText}`);
      const errorText = await connectionResponse.text();
      console.error('   Détails:', errorText);
    }
  } catch (error) {
    console.error('   ❌ Erreur de connexion:', error.message);
  }
  console.log('');

  // Test 2: Récupérer la configuration du webhook actuelle
  console.log('2️⃣ Récupération de la configuration webhook...');
  try {
    const webhookResponse = await fetch(
      `${EVOLUTION_API_BASE_URL}/webhook/find/${INSTANCE_NAME}`,
      {
        method: 'GET',
        headers: {
          'apikey': INSTANCE_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (webhookResponse.ok) {
      const webhookData = await webhookResponse.json();
      console.log('   ✅ Configuration webhook récupérée');
      console.log('   Détails:', JSON.stringify(webhookData, null, 2));

      // Vérifier si MESSAGES_UPSERT est présent
      if (webhookData.webhook?.events) {
        const hasMessagesUpsert = webhookData.webhook.events.includes('MESSAGES_UPSERT');
        if (hasMessagesUpsert) {
          console.log('   ✅ Événement MESSAGES_UPSERT configuré');
        } else {
          console.error('   ❌ Événement MESSAGES_UPSERT MANQUANT !');
          console.log('   Événements actuels:', webhookData.webhook.events);
        }
      }

      // Vérifier si le webhook est activé
      if (webhookData.webhook?.enabled) {
        console.log('   ✅ Webhook activé');
      } else {
        console.error('   ❌ Webhook DÉSACTIVÉ !');
      }

      // Vérifier l'URL
      if (webhookData.webhook?.url) {
        console.log(`   URL: ${webhookData.webhook.url}`);
        if (webhookData.webhook.url.includes('evolution-webhook-handler')) {
          console.log('   ✅ URL semble correcte');
        } else {
          console.error('   ⚠️  URL ne contient pas "evolution-webhook-handler"');
        }
      } else {
        console.error('   ❌ URL du webhook manquante !');
      }
    } else {
      console.error(`   ❌ Erreur: ${webhookResponse.status} ${webhookResponse.statusText}`);
      const errorText = await webhookResponse.text();
      console.error('   Détails:', errorText);

      if (webhookResponse.status === 404) {
        console.log('\n   ℹ️  Le webhook n\'est peut-être pas configuré.');
        console.log('   Vous devez appeler la fonction Supabase "set-webhook"');
      }
    }
  } catch (error) {
    console.error('   ❌ Erreur de connexion:', error.message);
  }
  console.log('');

  // Test 3: Lister toutes les instances (avec la clé globale si disponible)
  if (EVOLUTION_API_KEY) {
    console.log('3️⃣ Liste de toutes les instances...');
    try {
      const instancesResponse = await fetch(
        `${EVOLUTION_API_BASE_URL}/instance/fetchInstances`,
        {
          method: 'GET',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      if (instancesResponse.ok) {
        const instancesData = await instancesResponse.json();
        console.log('   ✅ Instances récupérées');
        console.log('   Nombre d\'instances:', Array.isArray(instancesData) ? instancesData.length : 'inconnu');

        if (Array.isArray(instancesData)) {
          const ourInstance = instancesData.find((inst: any) =>
            inst.instance?.instanceName === INSTANCE_NAME || inst.instanceName === INSTANCE_NAME
          );

          if (ourInstance) {
            console.log('   ✅ Notre instance trouvée dans la liste');
            console.log('   Détails:', JSON.stringify(ourInstance, null, 2));
          } else {
            console.error('   ❌ Notre instance NON trouvée dans la liste !');
            console.log('   Instances disponibles:');
            instancesData.forEach((inst: any) => {
              console.log(`      - ${inst.instance?.instanceName || inst.instanceName}`);
            });
          }
        }
      } else {
        console.error(`   ❌ Erreur: ${instancesResponse.status} ${instancesResponse.statusText}`);
      }
    } catch (error) {
      console.error('   ❌ Erreur de connexion:', error.message);
    }
  } else {
    console.log('3️⃣ Liste des instances ignorée (EVOLUTION_API_KEY manquant)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostic terminé\n');
  console.log('📋 PROCHAINES ÉTAPES:');
  console.log('   1. Si le webhook n\'est pas configuré, appelez la fonction Supabase "set-webhook"');
  console.log('   2. Si MESSAGES_UPSERT manque, reconfigurez les événements');
  console.log('   3. Si l\'URL est incorrecte, vérifiez webhook_url dans evolution_instances');
  console.log('   4. Vérifiez les logs Supabase : Dashboard > Edge Functions > evolution-webhook-handler');
}

testWebhookConfig();
