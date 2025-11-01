// Edge Function: refresh-qr-codes
// Description: Automatically refreshes QR codes for all connecting instances
//              This function is called every minute via cron job to ensure users
//              always have a valid QR code to scan, even if they're not connected yet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface EvolutionInstance {
  id: string;
  user_id: string;
  instance_name: string;
  instance_status: string;
  instance_token: string;
  last_qr_update: string | null;
}

interface QRRefreshResult {
  instance_name: string;
  success: boolean;
  error?: string;
  qr_updated?: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to fetch QR code from Evolution API
async function fetchQRCode(
  instanceName: string,
  instanceToken: string,
  baseUrl: string
): Promise<string | null> {
  const url = `${baseUrl}/instance/connect/${instanceName}`;

  console.log(`[refresh-qr-codes] Fetching QR for ${instanceName}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': instanceToken,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000), // 8 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[refresh-qr-codes] Failed to fetch QR for ${instanceName}: ${response.status} ${errorText}`);
      return null;
    }

    const data = await response.json();

    // Evolution API can return QR code in different formats
    let base64QR = null;

    if (data.base64) {
      base64QR = data.base64;
    } else if (data.qrcode && data.qrcode.base64) {
      base64QR = data.qrcode.base64;
    } else if (typeof data === 'string') {
      base64QR = data;
    }

    if (!base64QR) {
      console.log(`[refresh-qr-codes] No QR code in response for ${instanceName}`);
      return null;
    }

    // Ensure it has the data URI prefix
    if (!base64QR.startsWith('data:image/png;base64,')) {
      base64QR = `data:image/png;base64,${base64QR}`;
    }

    console.log(`[refresh-qr-codes] Successfully fetched QR for ${instanceName}`);
    return base64QR;

  } catch (error) {
    console.error(`[refresh-qr-codes] Error fetching QR for ${instanceName}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const evolutionApiBaseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') || 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log('[refresh-qr-codes] Starting QR code refresh cycle...');

    // Get all instances that are in "connecting" status
    const { data: instances, error: fetchError } = await supabase
      .from('evolution_instances')
      .select('id, user_id, instance_name, instance_status, instance_token, last_qr_update')
      .eq('instance_status', 'connecting');

    if (fetchError) {
      console.error('[refresh-qr-codes] Error fetching instances:', fetchError);
      throw fetchError;
    }

    if (!instances || instances.length === 0) {
      console.log('[refresh-qr-codes] No connecting instances found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No connecting instances to refresh',
          refreshed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[refresh-qr-codes] Found ${instances.length} connecting instance(s)`);

    const results: QRRefreshResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each instance
    for (const instance of instances as EvolutionInstance[]) {
      console.log(`[refresh-qr-codes] Processing ${instance.instance_name}...`);

      try {
        // Fetch new QR code from Evolution API
        const qrCode = await fetchQRCode(
          instance.instance_name,
          instance.instance_token,
          evolutionApiBaseUrl
        );

        if (qrCode) {
          // Update the database with new QR code
          const { error: updateError } = await supabase
            .from('evolution_instances')
            .update({
              qr_code: qrCode,
              last_qr_update: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', instance.id);

          if (updateError) {
            console.error(`[refresh-qr-codes] Failed to update DB for ${instance.instance_name}:`, updateError);
            results.push({
              instance_name: instance.instance_name,
              success: false,
              error: `Database update failed: ${updateError.message}`,
            });
            failureCount++;
          } else {
            console.log(`[refresh-qr-codes] ✓ Successfully refreshed QR for ${instance.instance_name}`);
            results.push({
              instance_name: instance.instance_name,
              success: true,
              qr_updated: true,
            });
            successCount++;
          }
        } else {
          // No QR code available (might be connecting, or instance issue)
          console.log(`[refresh-qr-codes] No QR code available for ${instance.instance_name}`);
          results.push({
            instance_name: instance.instance_name,
            success: true,
            qr_updated: false,
            error: 'No QR code available from Evolution API',
          });
          // Don't count as failure - instance might be transitioning states
        }

      } catch (error) {
        console.error(`[refresh-qr-codes] Error processing ${instance.instance_name}:`, error);
        results.push({
          instance_name: instance.instance_name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failureCount++;
      }
    }

    console.log(`[refresh-qr-codes] Refresh cycle complete: ${successCount} success, ${failureCount} failures`);

    return new Response(
      JSON.stringify({
        success: true,
        total_instances: instances.length,
        refreshed: successCount,
        failed: failureCount,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      }
    );

  } catch (error) {
    console.error('[refresh-qr-codes] Fatal error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      }
    );
  }
});
