import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log(`[cleanup-old-instances] Starting cleanup for user ${user.id}`);

    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    if (!EVOLUTION_API_KEY) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');

    // Get all instances from Evolution API
    const listResponse = await fetch(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    if (!listResponse.ok) {
      throw new Error('Failed to fetch instances from Evolution API');
    }

    const instances = await listResponse.json();
    const userPrefix = `user_${user.id}_`;
    const oldInstances = [];

    // Find all instances with timestamp pattern (user_xxx_1234567890)
    if (Array.isArray(instances)) {
      for (const inst of instances) {
        const instanceName = inst.instance?.instanceName || '';
        
        // Check if it's an old format instance (has timestamp)
        if (instanceName.startsWith(userPrefix) && /user_[^_]+_\d{13}/.test(instanceName)) {
          oldInstances.push(instanceName);
        }
      }
    }

    console.log(`[cleanup-old-instances] Found ${oldInstances.length} old instances to clean up`);

    // Get user's instance record from database
    const { data: dbInstance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const deletedInstances = [];
    const errors = [];

    // Delete old instances from Evolution API
    for (const instanceName of oldInstances) {
      try {
        // Skip if this is the current instance in the database
        if (dbInstance && dbInstance.instance_name === instanceName) {
          console.log(`[cleanup-old-instances] Skipping current instance: ${instanceName}`);
          continue;
        }

        console.log(`[cleanup-old-instances] Deleting old instance: ${instanceName}`);
        
        const deleteResponse = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: {
            'apikey': EVOLUTION_API_KEY,
          },
        });

        if (deleteResponse.ok) {
          deletedInstances.push(instanceName);
          console.log(`[cleanup-old-instances] Successfully deleted: ${instanceName}`);
        } else {
          const errorText = await deleteResponse.text();
          console.error(`[cleanup-old-instances] Failed to delete ${instanceName}:`, errorText);
          errors.push({ instance: instanceName, error: errorText });
        }
      } catch (error) {
        console.error(`[cleanup-old-instances] Error deleting ${instanceName}:`, error);
        errors.push({ instance: instanceName, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    console.log(`[cleanup-old-instances] Cleanup complete. Deleted: ${deletedInstances.length}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Nettoyage terminé avec succès`,
        deleted: deletedInstances.length,
        errors: errors.length,
        details: {
          deletedInstances,
          errors,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[cleanup-old-instances] Error:', error);
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
