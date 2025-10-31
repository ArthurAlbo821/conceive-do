const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔀 [test-webhook] Requête OPTIONS (CORS preflight) - Réponse automatique');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ÉTAPE 1 : DÉMARRAGE
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(80));
    console.log(`🚀 [test-webhook] DÉMARRAGE - ${timestamp}`);
    console.log('='.repeat(80));

    // ÉTAPE 2 : EXTRACTION DES INFORMATIONS DE LA REQUÊTE
    console.log('\n📥 [test-webhook] ÉTAPE 1 - Extraction des informations de la requête');
    const method = req.method;
    const url = req.url;
    console.log(`   ➜ Méthode HTTP: ${method}`);
    console.log(`   ➜ URL complète: ${url}`);

    // ÉTAPE 3 : EXTRACTION DES HEADERS
    console.log('\n📋 [test-webhook] ÉTAPE 2 - Extraction des headers');
    const headers = Object.fromEntries(req.headers.entries());
    const headerCount = Object.keys(headers).length;
    console.log(`   ➜ Nombre de headers: ${headerCount}`);
    console.log(`   ➜ Headers reçus:`, JSON.stringify(headers, null, 2));

    // ÉTAPE 4 : PARSING DU BODY
    console.log('\n📦 [test-webhook] ÉTAPE 3 - Parsing du body de la requête');
    let body = null;
    let bodyType = 'vide';
    try {
      console.log('   ➜ Tentative de parsing JSON...');
      body = await req.json();
      bodyType = 'JSON';
      console.log('   ✅ Body parsé en JSON avec succès');
    } catch {
      console.log('   ⚠️  Échec du parsing JSON, tentative en texte...');
      body = await req.text();
      bodyType = 'texte';
      console.log('   ✅ Body récupéré en tant que texte');
    }
    console.log(`   ➜ Type de body: ${bodyType}`);
    console.log(`   ➜ Contenu du body:`, typeof body === 'string' ? body : JSON.stringify(body, null, 2));

    // ÉTAPE 5 : PRÉPARATION DE LA RÉPONSE
    console.log('\n📤 [test-webhook] ÉTAPE 4 - Préparation de la réponse');
    const responseData = {
      success: true,
      message: 'Webhook received successfully',
      timestamp,
      received: {
        method,
        url,
        headers,
        body
      }
    };
    console.log('   ✅ Objet de réponse créé avec succès');

    // ÉTAPE 6 : ENVOI DE LA RÉPONSE
    console.log('\n✨ [test-webhook] TERMINÉ - Envoi de la réponse avec succès');
    console.log('='.repeat(80) + '\n');

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // GESTION D'ERREUR
    console.log('\n' + '❌'.repeat(40));
    console.error('❌ [test-webhook] ERREUR DÉTECTÉE');
    console.error('   ➜ Type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('   ➜ Message:', error instanceof Error ? error.message : String(error));
    console.error('   ➜ Stack:', error instanceof Error ? error.stack : 'Non disponible');
    console.log('❌'.repeat(40) + '\n');

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
