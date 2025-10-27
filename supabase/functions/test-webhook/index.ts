const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const headers = Object.fromEntries(req.headers.entries());
    
    let body = null;
    try {
      body = await req.json();
    } catch {
      body = await req.text();
    }

    console.log('='.repeat(80));
    console.log(`[test-webhook] ${timestamp}`);
    console.log('='.repeat(80));
    console.log(`Method: ${method}`);
    console.log(`URL: ${url}`);
    console.log(`Headers:`, JSON.stringify(headers, null, 2));
    console.log(`Body:`, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    console.log('='.repeat(80));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook received successfully',
        timestamp,
        received: {
          method,
          url,
          headers,
          body
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[test-webhook] Error:', error);
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
