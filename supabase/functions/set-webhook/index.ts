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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown fetch error');
      console.error(`[fetchWithRetry] Attempt ${attempt + 1}/${retries + 1} failed:`, lastError.message);

      if (attempt < retries) {
        const backoffMs = 800 * Math.pow(2, attempt);
        console.log(`[fetchWithRetry] Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[set-webhook] Configuring webhook for user ${user.id}`);

    // Get user's instance from DB
    const { data: instance, error: fetchError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError || !instance) {
      throw new Error('Instance not found');
    }

    const instanceName = instance.instance_name;
    const instanceToken = instance.instance_token;
    const webhookUrl = instance.webhook_url;

    if (!instanceToken) {
      throw new Error('Instance token not available');
    }

    const evolutionBaseUrl = Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://evo.voxium.cloud';

    console.log(`[set-webhook] Setting webhook for instance ${instanceName}`);

    const webhookPayload = {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'SEND_MESSAGE'
      ]
    };

    const response = await fetchWithRetry(
      `${evolutionBaseUrl}/webhook/set/${instanceName}`,
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[set-webhook] Evolution API error:', errorText);
      throw new Error(`Failed to set webhook: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('[set-webhook] Webhook configured successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook reconfiguré avec succès',
        data: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[set-webhook] Error:', error);
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
