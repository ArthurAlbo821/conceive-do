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

    console.log(`[create-evolution-instance] User ${user.id} requesting instance`);

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

    if (existingInstance && existingInstance.instance_status !== 'error') {
      console.log(`[create-evolution-instance] Returning existing instance: ${existingInstance.instance_name}`);
      return new Response(
        JSON.stringify({
          success: true,
          instance: existingInstance,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    if (!EVOLUTION_API_KEY) {
      throw new Error('EVOLUTION_API_KEY not configured');
    }

    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'http://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
    const instanceName = `user_${user.id}_${Date.now()}`;
    const instanceToken = `token_${crypto.randomUUID()}`;
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evolution-webhook-handler`;

    console.log(`[create-evolution-instance] Creating instance: ${instanceName}`);

    // Step 1: Create instance
    let createResponse: Response;
    try {
      createResponse = await fetchWithRetry(
        `${baseUrl}/manager/instance/create`,
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

    console.log(`[create-evolution-instance] Instance created, configuring webhook`);

    // Step 2: Configure webhook
    try {
      const webhookResponse = await fetchWithRetry(
        `${baseUrl}/manager/webhook/set/${instanceName}`,
        {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
          }),
        },
        { retries: 2, timeoutMs: 10000 }
      );

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error('[create-evolution-instance] Webhook configuration error:', errorText);
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
        `${baseUrl}/manager/instance/connect/${instanceName}`,
        {
          method: 'GET',
          headers: {
            'apikey': EVOLUTION_API_KEY,
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
