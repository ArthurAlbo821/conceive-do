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

    // Get user's instance
    const { data: instance, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (instanceError) {
      console.error('[check-instance-status] Error fetching instance:', instanceError);
      throw instanceError;
    }

    if (!instance) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No instance found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    if (!EVOLUTION_API_KEY) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');

    console.log(`[check-instance-status] Checking status for: ${instance.instance_name}`);

    // Check instance status from Evolution API
    let statusResponse: Response;
    try {
      statusResponse = await fetchWithRetry(
        `${baseUrl}/instance/connectionState/${instance.instance_name}`,
        {
          method: 'GET',
          headers: {
            'apikey': EVOLUTION_API_KEY,
          },
        },
        { retries: 2, timeoutMs: 10000 }
      );
    } catch (error) {
      console.error('[check-instance-status] Evolution API unreachable:', error);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_unreachable',
          error: 'L\'API Evolution est temporairement indisponible.',
          details: error instanceof Error ? error.message : 'Network timeout',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('[check-instance-status] Evolution API error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_error',
          error: 'Erreur lors de la vérification du statut.',
          details: errorText,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const statusData = await statusResponse.json();
    const state = statusData.instance?.state;

    console.log(`[check-instance-status] Evolution API state: ${state}`);

    let newStatus: string | null = null;
    if (state === 'open') {
      newStatus = 'connected';
    } else if (state === 'close') {
      newStatus = 'disconnected';
    } else if (state === 'connecting') {
      newStatus = 'connecting';
    }

    // Update status in database if changed
    if (newStatus && newStatus !== instance.instance_status) {
      console.log(`[check-instance-status] Updating status from ${instance.instance_status} to ${newStatus}`);
      
      const { error: updateError } = await supabase
        .from('evolution_instances')
        .update({ instance_status: newStatus })
        .eq('id', instance.id);

      if (updateError) {
        console.error('[check-instance-status] Error updating status:', updateError);
      }
    }

    // Return current instance data
    const { data: updatedInstance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('id', instance.id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        status: updatedInstance?.instance_status || instance.instance_status,
        phone_number: updatedInstance?.phone_number || instance.phone_number,
        qr_code: updatedInstance?.qr_code || instance.qr_code,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[check-instance-status] Error:', error);
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
