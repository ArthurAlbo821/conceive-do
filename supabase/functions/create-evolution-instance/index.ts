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

    // Parse request body for forceRefresh parameter
    const body = await req.json().catch(() => ({}));
    const forceRefresh = body?.forceRefresh === true;

    console.log(`[create-evolution-instance] User ${user.id} requesting instance (forceRefresh: ${forceRefresh})`);

    // Check if user already has an instance
    const { data: existingInstance, error: checkError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[create-evolution-instance] Error checking existing instance:', checkError);
      throw checkError;
    }

    // If forceRefresh is true and instance is connecting, regenerate QR code
    if (forceRefresh && existingInstance && existingInstance.instance_status === 'connecting' && existingInstance.instance_token) {
      console.log(`[create-evolution-instance] Force refreshing QR code for instance: ${existingInstance.instance_name}`);
      
      const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
      
      try {
        const qrResponse = await fetchWithRetry(
          `${baseUrl}/instance/connect/${existingInstance.instance_name}`,
          {
            method: 'GET',
            headers: {
              'apikey': existingInstance.instance_token,
            },
          },
          { retries: 2, timeoutMs: 10000 }
        );

        if (!qrResponse.ok) {
          throw new Error('Failed to fetch new QR code');
        }

        const qrData = await qrResponse.json();
        const qrCodeBase64 = qrData.base64 || qrData.qrcode?.base64;

        // Update QR code in database
        const { data: updatedInstance, error: updateError } = await supabase
          .from('evolution_instances')
          .update({
            qr_code: qrCodeBase64,
            last_qr_update: new Date().toISOString(),
          })
          .eq('id', existingInstance.id)
          .select()
          .single();

        if (updateError) {
          console.error('[create-evolution-instance] Failed to update QR code:', updateError);
          throw updateError;
        }

        console.log(`[create-evolution-instance] QR code refreshed successfully`);

        return new Response(
          JSON.stringify({
            success: true,
            instance: updatedInstance,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('[create-evolution-instance] Error refreshing QR code:', error);
        return new Response(
          JSON.stringify({
            success: false,
            code: 'qr_refresh_failed',
            error: 'Impossible de rafraîchir le QR code.',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // If instance exists and is valid (not error/disconnected and has token), return it
    if (existingInstance && 
        existingInstance.instance_status !== 'error' && 
        existingInstance.instance_status !== 'disconnected' &&
        existingInstance.instance_token) {
      console.log(`[create-evolution-instance] Returning existing instance: ${existingInstance.instance_name}`);
      return new Response(
        JSON.stringify({
          success: true,
          instance: existingInstance,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If instance exists but is disconnected or has no token, delete it first
    if (existingInstance && (existingInstance.instance_status === 'disconnected' || !existingInstance.instance_token)) {
      console.log(`[create-evolution-instance] Deleting invalid instance (status: ${existingInstance.instance_status}, has_token: ${!!existingInstance.instance_token})`);
      
      // Delete from database
      const { error: deleteError } = await supabase
        .from('evolution_instances')
        .delete()
        .eq('id', existingInstance.id);
      
      if (deleteError) {
        console.error('[create-evolution-instance] Error deleting instance:', deleteError);
      }
      
      // Try to delete from Evolution API if we have instance name
      if (existingInstance.instance_name && existingInstance.instance_token) {
        const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
        try {
          await fetchWithRetry(
            `${baseUrl}/instance/delete/${existingInstance.instance_name}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': existingInstance.instance_token,
              },
            },
            { retries: 1, timeoutMs: 5000 }
          );
          console.log(`[create-evolution-instance] Deleted instance from Evolution API`);
        } catch (error) {
          console.error('[create-evolution-instance] Could not delete from Evolution API (continuing anyway):', error);
        }
      }
    }

    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    if (!EVOLUTION_API_KEY) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
    const instanceName = `user_${user.id}_${Date.now()}`;
    const instanceToken = `token_${crypto.randomUUID()}`;
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evolution-webhook-handler`;

    console.log(`[create-evolution-instance] Creating instance: ${instanceName}`);

    // Step 1: Create instance
    let createResponse: Response;
    try {
      createResponse = await fetchWithRetry(
        `${baseUrl}/instance/create`,
        {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instanceName: instanceName,
            token: instanceToken,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        },
        { retries: 2, timeoutMs: 10000 }
      );
    } catch (error) {
      console.error('[create-evolution-instance] Evolution API unreachable:', error);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_unreachable',
          error: 'L\'API Evolution est temporairement indisponible. Veuillez réessayer dans quelques minutes.',
          details: error instanceof Error ? error.message : 'Network timeout',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('[create-evolution-instance] Evolution API create error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_error',
          error: 'Erreur lors de la création de l\'instance WhatsApp.',
          details: errorText,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the API-generated token from the response
    const createData = await createResponse.json();
    // The token can be in multiple places depending on the API version
    const apiGeneratedToken = 
      (typeof createData.hash === 'string' ? createData.hash : createData.hash?.apikey) || 
      createData.instance?.token ||
      instanceToken; // Fallback to our generated token

    if (!apiGeneratedToken) {
      console.error('[create-evolution-instance] No token in API response:', createData);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'missing_token',
          error: 'L\'API n\'a pas retourné de token d\'instance.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[create-evolution-instance] Received instance token from API (type: ${typeof createData.hash})`);

    console.log(`[create-evolution-instance] Received instance token from API`);
    console.log(`[create-evolution-instance] Instance created, configuring webhook`);
    console.log(`[create-evolution-instance] Webhook URL: ${webhookUrl}`);

    // Step 2: Configure webhook with detailed logging
    try {
      const webhookConfig = {
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
      
      console.log(`[create-evolution-instance] Webhook config:`, JSON.stringify(webhookConfig, null, 2));
      
      const webhookResponse = await fetchWithRetry(
        `${baseUrl}/webhook/set/${instanceName}`,
        {
          method: 'POST',
          headers: {
            'apikey': apiGeneratedToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookConfig),
        },
        { retries: 2, timeoutMs: 10000 }
      );

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error('[create-evolution-instance] Webhook configuration error:', {
          status: webhookResponse.status,
          error: webhookResponse.statusText,
          response: errorText
        });
        
        // Try alternative webhook configuration format
        console.log('[create-evolution-instance] Trying alternative webhook configuration...');
        const altWebhookResponse = await fetchWithRetry(
          `${baseUrl}/webhook/set/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'apikey': apiGeneratedToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              webhook: {
                url: webhookUrl,
                events: true
              }
            }),
          },
          { retries: 1, timeoutMs: 10000 }
        );
        
        if (!altWebhookResponse.ok) {
          const altErrorText = await altWebhookResponse.text();
          console.error('[create-evolution-instance] Alternative webhook config also failed:', altErrorText);
        } else {
          console.log('[create-evolution-instance] Alternative webhook configuration successful');
        }
      } else {
        const webhookResult = await webhookResponse.json();
        console.log('[create-evolution-instance] Webhook configured successfully:', webhookResult);
      }
    } catch (error) {
      console.error('[create-evolution-instance] Webhook configuration failed:', error);
      // Non-blocking: continue without webhook
    }

    console.log(`[create-evolution-instance] Webhook configured, fetching QR code`);

    // Step 3: Get QR code
    let qrResponse: Response;
    try {
      qrResponse = await fetchWithRetry(
        `${baseUrl}/instance/connect/${instanceName}`,
        {
          method: 'GET',
          headers: {
            'apikey': apiGeneratedToken,
          },
        },
        { retries: 2, timeoutMs: 10000 }
      );
    } catch (error) {
      console.error('[create-evolution-instance] QR code fetch failed:', error);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_unreachable',
          error: 'L\'API Evolution est temporairement indisponible. Veuillez réessayer dans quelques minutes.',
          details: error instanceof Error ? error.message : 'Network timeout',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!qrResponse.ok) {
      const errorText = await qrResponse.text();
      console.error('[create-evolution-instance] QR code fetch error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'evolution_api_error',
          error: 'Impossible de récupérer le QR code.',
          details: errorText,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const qrData = await qrResponse.json();
    const qrCodeBase64 = qrData.base64 || qrData.qrcode?.base64;

    console.log(`[create-evolution-instance] QR code retrieved, saving to database`);

    // Step 4: Save to database
    if (existingInstance) {
      // Update existing instance
      const { data: updatedInstance, error: updateError } = await supabase
        .from('evolution_instances')
        .update({
          instance_name: instanceName,
          instance_token: apiGeneratedToken,
          instance_status: 'connecting',
          qr_code: qrCodeBase64,
          webhook_url: webhookUrl,
          last_qr_update: new Date().toISOString(),
        })
        .eq('id', existingInstance.id)
        .select()
        .single();

      if (updateError) {
        console.error('[create-evolution-instance] Database update error:', updateError);
        throw updateError;
      }

      console.log(`[create-evolution-instance] Instance updated successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          instance: updatedInstance,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Insert new instance
      const { data: newInstance, error: insertError } = await supabase
        .from('evolution_instances')
        .insert({
          user_id: user.id,
          instance_name: instanceName,
          instance_token: apiGeneratedToken,
          instance_status: 'connecting',
          qr_code: qrCodeBase64,
          webhook_url: webhookUrl,
          last_qr_update: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('[create-evolution-instance] Database insert error:', insertError);
        throw insertError;
      }

      console.log(`[create-evolution-instance] Instance created successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          instance: newInstance,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[create-evolution-instance] Error:', error);
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
