// supabase/functions/create-evolution-instance/index.ts
// Creates or refreshes an Evolution instance for a user.
// Keeps the flow minimal: validate state, create/verify instance, configure webhook, fetch QR, persist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const WEBHOOK_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'];
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
async function fetchWithRetry(url: string, options: RequestInit, config: { retries?: number; timeoutMs?: number } = {}): Promise<Response> {
  const { retries = 1, timeoutMs = 10000 } = config;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown fetch error');
      console.error(`[fetchWithRetry] Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, lastError.message);
      if (attempt < retries) await wait(500);
    }
  }
  throw lastError ?? new Error('All retry attempts failed');
}

async function checkInstanceExists(instanceName: string, instanceToken: string, baseUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithRetry(
      `${baseUrl}/instance/connectionState/${instanceName}`,
      { method: 'GET', headers: { apikey: instanceToken } },
      { retries: 1, timeoutMs: 8000 },
    );
    if (response.status === 404) {
      console.log(`[checkInstanceExists] Instance ${instanceName} not found (404)`);
      return false;
    }
    if (!response.ok) {
      const details = await response.text().catch(() => 'no-body');
      console.error(`[checkInstanceExists] Unexpected status ${response.status}: ${details}`);
      return false;
    }
    console.log(`[checkInstanceExists] Instance ${instanceName} confirmed`);
    return true;
  } catch (error) {
    console.error('[checkInstanceExists] Error while checking instance existence:', error);
    return false;
  }
}

async function verifyTokenOrThrow(instanceName: string, instanceToken: string, baseUrl: string): Promise<void> {
  const exists = await checkInstanceExists(instanceName, instanceToken, baseUrl);
  if (!exists) {
    throw new Error('Token validation failed');
  }
}

async function configureWebhook(instanceName: string, instanceToken: string, baseUrl: string, webhookUrl: string): Promise<boolean> {
  const webhookPayload = {
    method: 'POST',
    headers: { apikey: instanceToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook: { url: webhookUrl, enabled: true, events: WEBHOOK_EVENTS } }),
  } satisfies RequestInit;
  try {
    const response = await fetchWithRetry(
      `${baseUrl}/webhook/set/${instanceName}`,
      webhookPayload,
      { retries: 0, timeoutMs: 10000 },
    );
    if (response.ok) {
      console.log('[create-evolution-instance] Webhook configured on first attempt');
      return true;
    }
    if (response.status === 404) {
      console.log('[create-evolution-instance] Webhook got 404, waiting before retry');
      await wait(2000);
      const retryResponse = await fetchWithRetry(
        `${baseUrl}/webhook/set/${instanceName}`,
        webhookPayload,
        { retries: 0, timeoutMs: 10000 },
      );
      if (retryResponse.ok) {
        console.log('[create-evolution-instance] Webhook configured on retry');
        return true;
      }
      const retryDetails = await retryResponse.text().catch(() => 'no-body');
      console.error('[create-evolution-instance] Webhook retry failed:', retryResponse.status, retryDetails);
      return false;
    }
    const details = await response.text().catch(() => 'no-body');
    console.error('[create-evolution-instance] Webhook failed:', response.status, details);
    return false;
  } catch (error) {
    console.error('[create-evolution-instance] Webhook configuration error:', error);
    try {
      await wait(2000);
      const retryResponse = await fetchWithRetry(
        `${baseUrl}/webhook/set/${instanceName}`,
        webhookPayload,
        { retries: 0, timeoutMs: 10000 },
      );
      if (retryResponse.ok) {
        console.log('[create-evolution-instance] Webhook configured after retrying error case');
        return true;
      }
      const retryDetails = await retryResponse.text().catch(() => 'no-body');
      console.error('[create-evolution-instance] Webhook retry after error failed:', retryResponse.status, retryDetails);
    } catch (retryError) {
      console.error('[create-evolution-instance] Webhook retry exception:', retryError);
    }

    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const body = await req.json().catch(() => ({}));
    const forceRefresh = body?.forceRefresh === true;
    const userId = body?.userId as string | undefined;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) throw new Error('Supabase environment variables missing');
    const isServiceRoleCall = supabaseServiceRoleKey && authHeader.includes(supabaseServiceRoleKey);
    const supabase = createClient(
      supabaseUrl,
      isServiceRoleCall && userId ? supabaseServiceRoleKey : supabaseAnonKey,
      isServiceRoleCall && userId
        ? undefined
        : { global: { headers: { Authorization: authHeader } } },
    );
    let user;
    if (isServiceRoleCall && userId) {
      console.log(`[create-evolution-instance] Service role call for user ${userId}`);
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !data.user) throw new Error(`User not found: ${userId}`);
      user = data.user;
    } else {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error('Unauthorized');
      user = data.user;
    }
    console.log(`[create-evolution-instance] User ${user.id} requested instance (forceRefresh: ${forceRefresh})`);
    const { data: existingInstance, error: existingError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    let currentInstance = existingInstance ?? null;
    if (currentInstance && !forceRefresh) {
      const status = currentInstance.instance_status;
      if (status === 'connecting' || status === 'connected') {
        console.log('[create-evolution-instance] Instance already active, returning existing data');
        return new Response(JSON.stringify({ success: true, instance: currentInstance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    if (currentInstance && currentInstance.instance_status === 'disconnected') {
      console.log('[create-evolution-instance] Removing disconnected instance before recreating');
      await supabase
        .from('evolution_instances')
        .delete()
        .eq('id', currentInstance.id);
      currentInstance = null;
    }
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    if (!EVOLUTION_API_KEY) throw new Error('EVOLUTION_API_KEY not configured');
    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ?? 'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook-handler`;
    if (forceRefresh) {
      if (!currentInstance || !currentInstance.instance_token) throw new Error('No instance available for refresh');
      console.log(`[create-evolution-instance] Refreshing QR code for ${currentInstance.instance_name}`);
      await verifyTokenOrThrow(currentInstance.instance_name, currentInstance.instance_token, baseUrl);
      const qrResponse = await fetchWithRetry(
        `${baseUrl}/instance/connect/${currentInstance.instance_name}`,
        {
          method: 'GET',
          headers: { apikey: currentInstance.instance_token },
        },
        { retries: 1, timeoutMs: 10000 },
      );
      if (!qrResponse.ok) {
        const details = await qrResponse.text().catch(() => 'no-body');
        throw new Error(`Unable to refresh QR code: ${details}`);
      }
      const qrPayload = await qrResponse.json();
      const refreshedQr = qrPayload.base64 || qrPayload.qrcode?.base64;
      if (!refreshedQr) throw new Error('QR code not provided by API');
      const { data: refreshedInstance, error: refreshError } = await supabase
        .from('evolution_instances')
        .update({
          qr_code: refreshedQr,
          instance_status: 'connecting',
          last_qr_update: new Date().toISOString(),
        })
        .eq('id', currentInstance.id)
        .select()
        .single();
      if (refreshError) throw refreshError;
      console.log('[create-evolution-instance] QR refresh complete');
      return new Response(JSON.stringify({ success: true, instance: refreshedInstance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const instanceName = `user_${user.id}`;
    const requestedToken = currentInstance?.instance_token ?? crypto.randomUUID();
    console.log(`[create-evolution-instance] Creating instance ${instanceName}`);

    const createResponse = await fetchWithRetry(
      `${baseUrl}/instance/create`,
      {
        method: 'POST',
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName,
          token: requestedToken,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
        }),
      },
      { retries: 1, timeoutMs: 10000 },
    );

    if (!createResponse.ok) {
      const details = await createResponse.text().catch(() => 'no-body');
      throw new Error(`Evolution API create error: ${details}`);
    }

    const createPayload = await createResponse.json();
    const apiGeneratedToken =
      (typeof createPayload.hash === 'string' ? createPayload.hash : createPayload.hash?.apikey) ||
      createPayload.instance?.token ||
      requestedToken;
    if (!apiGeneratedToken) throw new Error('Evolution API did not return a token');

    console.log('[create-evolution-instance] Token received from Evolution API, verifying connection state');
    await verifyTokenOrThrow(instanceName, apiGeneratedToken, baseUrl);

    const webhookConfigured = await configureWebhook(instanceName, apiGeneratedToken, baseUrl, webhookUrl);
    if (!webhookConfigured) {
      console.log('[create-evolution-instance] Continuing without webhook (non-blocking)');
    }

    const qrResponse = await fetchWithRetry(
      `${baseUrl}/instance/connect/${instanceName}`,
      {
        method: 'GET',
        headers: { apikey: apiGeneratedToken },
      },
      { retries: 1, timeoutMs: 10000 },
    );

    if (!qrResponse.ok) {
      const details = await qrResponse.text().catch(() => 'no-body');
      throw new Error(`Unable to retrieve QR code: ${details}`);
    }
    const qrPayload = await qrResponse.json();
    const qrCodeBase64 = qrPayload.base64 || qrPayload.qrcode?.base64;
    if (!qrCodeBase64) throw new Error('QR code not provided by API');

    const now = new Date().toISOString();

    if (currentInstance) {
      const { data: updatedInstance, error: updateError } = await supabase
        .from('evolution_instances')
        .update({
          instance_name: instanceName,
          instance_token: apiGeneratedToken,
          instance_status: 'connecting',
          qr_code: qrCodeBase64,
          webhook_url: webhookUrl,
          last_qr_update: now,
        })
        .eq('id', currentInstance.id)
        .select()
        .single();

      if (updateError) throw updateError;
      console.log('[create-evolution-instance] Instance updated and ready');
      return new Response(JSON.stringify({ success: true, instance: updatedInstance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: newInstance, error: insertError } = await supabase
      .from('evolution_instances')
      .insert({
        user_id: user.id,
        instance_name: instanceName,
        instance_token: apiGeneratedToken,
        instance_status: 'connecting',
        qr_code: qrCodeBase64,
        webhook_url: webhookUrl,
        last_qr_update: now,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    console.log('[create-evolution-instance] Instance created and ready');
    return new Response(JSON.stringify({ success: true, instance: newInstance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[create-evolution-instance] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
