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
    console.log('🔀 [reset-current-instance] Requête OPTIONS (CORS preflight)');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ÉTAPE 1 : DÉMARRAGE
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(80));
    console.log(`🚀 [reset-current-instance] DÉMARRAGE - ${timestamp}`);
    console.log('='.repeat(80));

    // ÉTAPE 2 : AUTHENTIFICATION
    console.log('\n🔐 [reset-current-instance] ÉTAPE 1 - Authentification');
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
    console.log('\n📊 [reset-current-instance] ÉTAPE 2 - Récupération de l\'instance dans la BDD');
    const { data: dbInstance, error: fetchError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('   ❌ Erreur lors de la récupération:', fetchError);
      throw new Error(`Failed to fetch instance: ${fetchError.message}`);
    }

    if (dbInstance) {
      console.log('   ✅ Instance trouvée dans la BDD');
      console.log('   ➜ ID:', dbInstance.id);
      console.log('   ➜ Instance name:', dbInstance.instance_name);
      console.log('   ➜ Status:', dbInstance.status);
      console.log('   ➜ Créée le:', dbInstance.created_at);
    } else {
      console.log('   ⚠️  Aucune instance trouvée dans la BDD');
    }

    // ÉTAPE 4 : CONFIGURATION
    console.log('\n⚙️  [reset-current-instance] ÉTAPE 3 - Configuration API Evolution');
    const instanceName = `user_${user.id}`;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionBaseUrl = Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://evo.voxium.cloud';

    console.log(`   ➜ Instance name: ${instanceName}`);
    console.log(`   ➜ Base URL: ${evolutionBaseUrl}`);
    console.log(`   ➜ API Key: ${evolutionApiKey ? '✅ Configurée' : '❌ Manquante'}`);

    if (!evolutionApiKey) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    // ÉTAPE 5 : SUPPRESSION DE L'INSTANCE DANS EVOLUTION API
    console.log('\n🗑️  [reset-current-instance] ÉTAPE 4 - Suppression dans Evolution API');
    const deleteUrl = `${evolutionBaseUrl}/instance/delete/${instanceName}`;
    console.log(`   ➜ URL: ${deleteUrl}`);

    try {
      const deleteResponse = await fetchWithRetry(
        deleteUrl,
        {
          method: 'DELETE',
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json',
          },
        },
        { retries: 1, timeoutMs: 8000 }
      );

      console.log(`\n   📡 Réponse reçue de Evolution API:`);
      console.log(`   ➜ Status: ${deleteResponse.status} ${deleteResponse.statusText}`);

      if (deleteResponse.ok) {
        const deleteData = await deleteResponse.json().catch(() => ({}));
        console.log('   ✅ Instance supprimée avec succès de Evolution API');
        console.log('   ➜ Réponse:', JSON.stringify(deleteData, null, 2));
      } else if (deleteResponse.status === 404) {
        console.log('   ⚠️  Instance non trouvée dans Evolution API (404)');
        console.log('   ➜ L\'instance a peut-être déjà été supprimée');
      } else {
        const errorText = await deleteResponse.text();
        console.warn(`   ⚠️  Evolution API a retourné une erreur (${deleteResponse.status}):`);
        console.warn(`   ➜ ${errorText}`);
      }
    } catch (error) {
      console.warn('   ⚠️  Échec de suppression dans Evolution API (on continue quand même)');
      console.warn('   ➜ Erreur:', error instanceof Error ? error.message : String(error));
    }

    // ÉTAPE 6 : SUPPRESSION DE L'INSTANCE DANS LA BDD
    console.log('\n🗄️  [reset-current-instance] ÉTAPE 5 - Suppression dans la base de données');
    if (dbInstance) {
      console.log(`   ➜ Suppression de l'instance ID: ${dbInstance.id}`);
      const { error: deleteDbError } = await supabase
        .from('evolution_instances')
        .delete()
        .eq('user_id', user.id);

      if (deleteDbError) {
        console.error('   ❌ Erreur lors de la suppression:', deleteDbError);
        throw new Error(`Failed to delete from database: ${deleteDbError.message}`);
      }
      console.log('   ✅ Instance supprimée avec succès de la BDD');
    } else {
      console.log('   ℹ️  Aucune instance à supprimer dans la BDD');
    }

    // ÉTAPE 7 : SUCCÈS
    console.log('\n✨ [reset-current-instance] TERMINÉ AVEC SUCCÈS');
    console.log(`   ➜ Instance ${instanceName} complètement réinitialisée`);
    console.log('='.repeat(80) + '\n');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instance supprimée avec succès',
        instanceName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // GESTION D'ERREUR
    console.log('\n' + '❌'.repeat(40));
    console.error('❌ [reset-current-instance] ERREUR DÉTECTÉE');
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
