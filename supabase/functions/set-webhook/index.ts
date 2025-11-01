import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function for retrying fetch with timeout
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: { retries?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const { retries = 2, timeoutMs = 10000 } = config;
  let lastError: Error | null = null;

  console.log(`🔄 [fetchWithRetry] Configuration:`, { url, retries, timeoutMs });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`   ➜ Tentative ${attempt + 1}/${retries + 1}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`   ✅ Succès ! Status: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown fetch error');
      console.error(`   ❌ Tentative ${attempt + 1}/${retries + 1} échouée:`, lastError.message);

      if (attempt < retries) {
        const backoffMs = 800 * Math.pow(2, attempt);
        console.log(`   ⏳ Nouvelle tentative dans ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error(`   ❌ Toutes les tentatives ont échoué après ${retries + 1} essais`);
  throw lastError || new Error('All retry attempts failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    console.log('🔀 [set-webhook] Requête OPTIONS (CORS preflight)');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ÉTAPE 1 : DÉMARRAGE
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(80));
    console.log(`🚀 [set-webhook] DÉMARRAGE - ${timestamp}`);
    console.log('='.repeat(80));

    // ÉTAPE 2 : AUTHENTIFICATION
    console.log('\n🔐 [set-webhook] ÉTAPE 1 - Authentification');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('   ❌ Aucun header Authorization trouvé');
      throw new Error('Missing authorization header');
    }
    console.log('   ✅ Header Authorization présent');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    console.log('   ✅ Client Supabase créé');

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('   ❌ Échec de récupération de l\'utilisateur:', userError);
      throw new Error('Unauthorized');
    }
    console.log(`   ✅ Utilisateur authentifié: ${user.id}`);
    console.log(`   ➜ Email: ${user.email || 'N/A'}`);

    // ÉTAPE 3 : RÉCUPÉRATION DE L'INSTANCE
    console.log('\n📊 [set-webhook] ÉTAPE 2 - Récupération de l\'instance');
    const { data: instance, error: fetchError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError || !instance) {
      console.error('   ❌ Instance non trouvée:', fetchError);
      throw new Error('Instance not found');
    }
    console.log('   ✅ Instance trouvée');
    console.log('   ➜ ID:', instance.id);
    console.log('   ➜ Nom:', instance.instance_name);
    console.log('   ➜ Status:', instance.status);

    // ÉTAPE 4 : EXTRACTION DES DONNÉES
    console.log('\n📋 [set-webhook] ÉTAPE 3 - Extraction des données de l\'instance');
    const instanceName = instance.instance_name;
    const instanceToken = instance.instance_token;
    const webhookUrl = instance.webhook_url;

    console.log(`   ➜ Instance name: ${instanceName}`);
    console.log(`   ➜ Webhook URL: ${webhookUrl}`);
    console.log(`   ➜ Token: ${instanceToken ? '✅ Présent' : '❌ Manquant'}`);

    if (!instanceToken) {
      console.error('   ❌ Token d\'instance non disponible');
      throw new Error('Instance token not available');
    }

    // ÉTAPE 5 : CONFIGURATION DU WEBHOOK
    console.log('\n⚙️  [set-webhook] ÉTAPE 4 - Préparation de la configuration webhook');
    const evolutionBaseUrl = Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://evo.voxium.cloud';
    console.log(`   ➜ Base URL: ${evolutionBaseUrl}`);

    const webhookPayload = {
      webhook: {
        url: webhookUrl,
        enabled: true,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ]
      }
    };
    console.log('   ➜ Configuration du webhook:');
    console.log('      • URL:', webhookPayload.webhook.url);
    console.log('      • Enabled:', webhookPayload.webhook.enabled);
    console.log('      • Événements écoutés:', webhookPayload.webhook.events.join(', '));

    // ÉTAPE 6 : APPEL API EVOLUTION
    console.log('\n📡 [set-webhook] ÉTAPE 5 - Appel à l\'API Evolution');
    const apiUrl = `${evolutionBaseUrl}/webhook/set/${instanceName}`;
    console.log(`   ➜ URL: ${apiUrl}`);

    const response = await fetchWithRetry(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'apikey': instanceToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      },
      { retries: 2, timeoutMs: 10000 }
    );

    // ÉTAPE 7 : TRAITEMENT DE LA RÉPONSE
    console.log('\n📥 [set-webhook] ÉTAPE 6 - Traitement de la réponse');
    console.log(`   ➜ Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('   ❌ Erreur de l\'API Evolution:', errorText);
      throw new Error(`Failed to set webhook: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('   ✅ Webhook configuré avec succès');
    console.log('   ➜ Réponse:', JSON.stringify(result, null, 2));

    // ÉTAPE 8 : SUCCÈS
    console.log('\n✨ [set-webhook] TERMINÉ AVEC SUCCÈS');
    console.log(`   ➜ Webhook configuré pour l'instance ${instanceName}`);
    console.log('='.repeat(80) + '\n');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook reconfiguré avec succès',
        data: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // GESTION D'ERREUR
    console.log('\n' + '❌'.repeat(40));
    console.error('❌ [set-webhook] ERREUR DÉTECTÉE');
    console.error('   ➜ Type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('   ➜ Message:', error instanceof Error ? error.message : String(error));
    console.error('   ➜ Stack:', error instanceof Error ? error.stack : 'Non disponible');
    console.log('❌'.repeat(40) + '\n');

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
