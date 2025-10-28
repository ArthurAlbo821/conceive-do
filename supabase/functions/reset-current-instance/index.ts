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

    console.log(`[reset-current-instance] Starting reset for user ${user.id}`);

    // Get user's instance from DB
    const { data: dbInstance, error: fetchError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[reset-current-instance] Error fetching instance:', fetchError);
      throw new Error(`Failed to fetch instance: ${fetchError.message}`);
    }

    const instanceName = `user_${user.id}`;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionBaseUrl = Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://evo.voxium.cloud';

    if (!evolutionApiKey) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    // Try to delete instance from Evolution API
    console.log(`[reset-current-instance] Attempting to delete instance ${instanceName} from Evolution API`);
    
    try {
      const deleteResponse = await fetchWithRetry(
        `${evolutionBaseUrl}/instance/delete/${instanceName}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json',
          },
        },
        { retries: 1, timeoutMs: 8000 }
      );

      if (deleteResponse.ok) {
        const deleteData = await deleteResponse.json().catch(() => ({}));
        console.log(`[reset-current-instance] Successfully deleted instance from Evolution API:`, deleteData);
      } else if (deleteResponse.status === 404) {
        console.log(`[reset-current-instance] Instance not found in Evolution API (404) - continuing with DB cleanup`);
      } else {
        const errorText = await deleteResponse.text();
        console.warn(`[reset-current-instance] Evolution API returned status ${deleteResponse.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn(`[reset-current-instance] Failed to delete from Evolution API (will continue):`, error);
    }

    // Delete instance from database
    if (dbInstance) {
      console.log(`[reset-current-instance] Deleting instance ${dbInstance.id} from database`);
      const { error: deleteDbError } = await supabase
        .from('evolution_instances')
        .delete()
        .eq('user_id', user.id);

      if (deleteDbError) {
        console.error('[reset-current-instance] Error deleting from DB:', deleteDbError);
        throw new Error(`Failed to delete from database: ${deleteDbError.message}`);
      }
      console.log('[reset-current-instance] Successfully deleted instance from database');
    } else {
      console.log('[reset-current-instance] No instance found in database to delete');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Instance supprimée avec succès',
        instanceName 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[reset-current-instance] Error:', error);
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
