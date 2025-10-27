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

    if (!instance.instance_token) {
      console.error('[check-instance-status] Instance has no token:', instance.instance_name);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instance token not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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
            'apikey': instance.instance_token,
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
      console.error('[check-instance-status] Evolution API error:', {
        status: statusResponse.status,
        error: statusResponse.statusText,
        response: errorText
      });
      
      // If 404, instance was manually deleted from Evolution API
      if (statusResponse.status === 404) {
        console.log('[check-instance-status] Instance not found in Evolution API (404), updating DB status');
        
        const { error: updateError } = await supabase
          .from('evolution_instances')
          .update({
            instance_status: 'disconnected',
            qr_code: null,
            last_qr_update: null,
          })
          .eq('id', instance.id);
        
        if (updateError) {
          console.error('[check-instance-status] Failed to update DB after 404:', updateError);
        } else {
          console.log('[check-instance-status] DB updated: status=disconnected, qr_code=null');
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            status: 'disconnected',
            message: 'Instance was deleted manually from Evolution API',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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

    console.log(`[check-instance-status] Evolution API state: ${state}`, JSON.stringify(statusData, null, 2));

    let newStatus: string | null = null;
    const updateData: any = {};
    
    if (state === 'open') {
      newStatus = 'connected';
      // Extract phone number if available
      const owner = statusData.instance?.owner;
      if (owner) {
        const phoneNumber = owner.split('@')[0];
        updateData.phone_number = phoneNumber;
        console.log(`[check-instance-status] Extracted phone number: ${phoneNumber}`);
      }
    } else if (state === 'close') {
      // If we were connecting and now we're close, try to regenerate QR before marking as disconnected
      if (instance.instance_status === 'connecting') {
        console.log(`[check-instance-status] Instance was connecting but now close, attempting QR regeneration`);
        
        try {
          const qrResponse = await fetchWithRetry(
            `${baseUrl}/instance/connect/${instance.instance_name}`,
            {
              method: 'GET',
              headers: {
                'apikey': instance.instance_token,
              },
            },
            { retries: 1, timeoutMs: 8000 }
          );

          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            const qrCodeBase64 = qrData.base64 || qrData.qrcode?.base64;

            if (qrCodeBase64) {
              console.log(`[check-instance-status] QR code regenerated successfully, keeping status as connecting`);
              newStatus = 'connecting';
              updateData.qr_code = qrCodeBase64;
              updateData.last_qr_update = new Date().toISOString();
            } else {
              console.log(`[check-instance-status] No QR code in response, marking as disconnected`);
              newStatus = 'disconnected';
              updateData.phone_number = null;
              updateData.qr_code = null;
            }
          } else {
            console.log(`[check-instance-status] QR regeneration failed (${qrResponse.status}), marking as disconnected`);
            newStatus = 'disconnected';
            updateData.phone_number = null;
            updateData.qr_code = null;
          }
        } catch (error) {
          console.error(`[check-instance-status] Error regenerating QR:`, error);
          newStatus = 'disconnected';
          updateData.phone_number = null;
          updateData.qr_code = null;
        }
      } else {
        // Was connected or other status, just mark as disconnected
        newStatus = 'disconnected';
        updateData.phone_number = null;
        updateData.qr_code = null;
        console.log(`[check-instance-status] Clearing phone_number and qr_code due to disconnection`);
      }
    } else if (state === 'connecting') {
      newStatus = 'connecting';
    }

    // Update status in database if changed
    if (newStatus && newStatus !== instance.instance_status) {
      console.log(`[check-instance-status] Updating status from ${instance.instance_status} to ${newStatus}`);
      
      updateData.instance_status = newStatus;
      
      const { error: updateError } = await supabase
        .from('evolution_instances')
        .update(updateData)
        .eq('id', instance.id);

      if (updateError) {
        console.error('[check-instance-status] Error updating status:', updateError);
      } else {
        console.log(`[check-instance-status] Status updated successfully:`, updateData);
      }
    } else if (Object.keys(updateData).length > 0) {
      // Update other fields even if status hasn't changed
      const { error: updateError } = await supabase
        .from('evolution_instances')
        .update(updateData)
        .eq('id', instance.id);

      if (updateError) {
        console.error('[check-instance-status] Error updating instance data:', updateError);
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
