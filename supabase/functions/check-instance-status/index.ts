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

    console.log(`[check-instance-status] Checking status for: ${instance.instance_name}`);

    // Check instance status from Evolution API
    const statusResponse = await fetch(
      `http://cst-evolution-api-kaezwnkk.usecloudstation.com/manager/instance/connectionState/${instance.instance_name}`,
      {
        method: 'GET',
        headers: {
          'apikey': EVOLUTION_API_KEY,
        },
      }
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('[check-instance-status] Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${errorText}`);
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
