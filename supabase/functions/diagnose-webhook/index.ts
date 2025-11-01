/**
 * Diagnostic Script for Webhook Configuration Issues
 *
 * This function tests webhook configuration with the Evolution API
 * to identify why webhooks are not being configured automatically.
 *
 * Usage: Call this function with an instance name to test webhook setup
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Retry helper function
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: { retries: number; timeoutMs: number }
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < config.retries) {
        console.log(`[diagnose-webhook] Attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

Deno.serve(async (req) => {
  try {
    console.log('[diagnose-webhook] Starting webhook configuration diagnostic');

    // CORS headers for browser access
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    // Parse request
    const { instanceName, instanceToken, userId } = await req.json();

    if (!instanceName || !instanceToken) {
      return new Response(
        JSON.stringify({
          error: 'Missing required parameters: instanceName and instanceToken'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[diagnose-webhook] Testing instance:', instanceName);

    // Get configuration
    const baseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ??
      'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook-handler`;

    console.log('[diagnose-webhook] Configuration:', {
      baseUrl,
      webhookUrl,
      instanceName
    });

    const diagnosticResults = {
      instanceName,
      webhookUrl,
      baseUrl,
      timestamp: new Date().toISOString(),
      methods: [] as any[],
      recommendation: '',
      success: false
    };

    // Test Method 1: Standard configuration
    console.log('[diagnose-webhook] Testing Method 1: Standard configuration');
    try {
      const method1Payload = {
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

      const method1Response = await fetchWithRetry(
        `${baseUrl}/webhook/set/${instanceName}`,
        {
          method: 'POST',
          headers: {
            'apikey': instanceToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(method1Payload),
        },
        { retries: 1, timeoutMs: 10000 }
      );

      const method1Result = {
        method: 'Method 1 - Standard',
        endpoint: `${baseUrl}/webhook/set/${instanceName}`,
        payload: method1Payload,
        status: method1Response.status,
        statusText: method1Response.statusText,
        success: method1Response.ok
      };

      if (method1Response.ok) {
        const responseData = await method1Response.json();
        method1Result['response'] = responseData;
        diagnosticResults.success = true;
        diagnosticResults.recommendation = 'Method 1 works! Webhook configured successfully.';
      } else {
        const errorText = await method1Response.text();
        method1Result['error'] = errorText;
      }

      diagnosticResults.methods.push(method1Result);
      console.log('[diagnose-webhook] Method 1 result:', method1Result);

    } catch (error) {
      console.error('[diagnose-webhook] Method 1 exception:', error);
      diagnosticResults.methods.push({
        method: 'Method 1 - Standard',
        success: false,
        exception: error.message
      });
    }

    // If Method 1 failed, test Method 2
    if (!diagnosticResults.success) {
      console.log('[diagnose-webhook] Testing Method 2: Wrapper format');
      try {
        const method2Payload = {
          webhook: {
            url: webhookUrl,
            enabled: true,
            events: [
              'QRCODE_UPDATED',
              'CONNECTION_UPDATE',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'SEND_MESSAGE'
            ]
          }
        };

        const method2Response = await fetchWithRetry(
          `${baseUrl}/webhook/set/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'apikey': instanceToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(method2Payload),
          },
          { retries: 1, timeoutMs: 10000 }
        );

        const method2Result = {
          method: 'Method 2 - Wrapper',
          endpoint: `${baseUrl}/webhook/set/${instanceName}`,
          payload: method2Payload,
          status: method2Response.status,
          statusText: method2Response.statusText,
          success: method2Response.ok
        };

        if (method2Response.ok) {
          const responseData = await method2Response.json();
          method2Result['response'] = responseData;
          diagnosticResults.success = true;
          diagnosticResults.recommendation = 'Method 2 works! Update code to use this format.';
        } else {
          const errorText = await method2Response.text();
          method2Result['error'] = errorText;
        }

        diagnosticResults.methods.push(method2Result);
        console.log('[diagnose-webhook] Method 2 result:', method2Result);

      } catch (error) {
        console.error('[diagnose-webhook] Method 2 exception:', error);
        diagnosticResults.methods.push({
          method: 'Method 2 - Wrapper',
          success: false,
          exception: error.message
        });
      }
    }

    // If Method 2 failed, test Method 3
    if (!diagnosticResults.success) {
      console.log('[diagnose-webhook] Testing Method 3: Enabled flag');
      try {
        const method3Payload = {
          url: webhookUrl,
          enabled: true,
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

        const method3Response = await fetchWithRetry(
          `${baseUrl}/webhook/set/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'apikey': instanceToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(method3Payload),
          },
          { retries: 1, timeoutMs: 10000 }
        );

        const method3Result = {
          method: 'Method 3 - Enabled flag',
          endpoint: `${baseUrl}/webhook/set/${instanceName}`,
          payload: method3Payload,
          status: method3Response.status,
          statusText: method3Response.statusText,
          success: method3Response.ok
        };

        if (method3Response.ok) {
          const responseData = await method3Response.json();
          method3Result['response'] = responseData;
          diagnosticResults.success = true;
          diagnosticResults.recommendation = 'Method 3 works! Update code to use this format.';
        } else {
          const errorText = await method3Response.text();
          method3Result['error'] = errorText;
        }

        diagnosticResults.methods.push(method3Result);
        console.log('[diagnose-webhook] Method 3 result:', method3Result);

      } catch (error) {
        console.error('[diagnose-webhook] Method 3 exception:', error);
        diagnosticResults.methods.push({
          method: 'Method 3 - Enabled flag',
          success: false,
          exception: error.message
        });
      }
    }

    // Test alternative endpoint: /webhook/instance
    if (!diagnosticResults.success) {
      console.log('[diagnose-webhook] Testing Alternative Endpoint: /webhook/instance');
      try {
        const altEndpointPayload = {
          instanceName: instanceName,
          url: webhookUrl,
          enabled: true,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE'
          ]
        };

        const altResponse = await fetchWithRetry(
          `${baseUrl}/webhook/instance`,
          {
            method: 'POST',
            headers: {
              'apikey': instanceToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(altEndpointPayload),
          },
          { retries: 1, timeoutMs: 10000 }
        );

        const altResult = {
          method: 'Alternative Endpoint - /webhook/instance',
          endpoint: `${baseUrl}/webhook/instance`,
          payload: altEndpointPayload,
          status: altResponse.status,
          statusText: altResponse.statusText,
          success: altResponse.ok
        };

        if (altResponse.ok) {
          const responseData = await altResponse.json();
          altResult['response'] = responseData;
          diagnosticResults.success = true;
          diagnosticResults.recommendation = 'Alternative endpoint works! Update code to use /webhook/instance.';
        } else {
          const errorText = await altResponse.text();
          altResult['error'] = errorText;
        }

        diagnosticResults.methods.push(altResult);
        console.log('[diagnose-webhook] Alternative endpoint result:', altResult);

      } catch (error) {
        console.error('[diagnose-webhook] Alternative endpoint exception:', error);
        diagnosticResults.methods.push({
          method: 'Alternative Endpoint',
          success: false,
          exception: error.message
        });
      }
    }

    // Final recommendation if all failed
    if (!diagnosticResults.success) {
      diagnosticResults.recommendation =
        'All webhook configuration methods failed. Possible causes:\n' +
        '1. Instance token is invalid or expired\n' +
        '2. Evolution API endpoint has changed\n' +
        '3. Evolution API requires different authentication\n' +
        '4. Network connectivity issues\n' +
        '5. Webhook URL is not reachable from Evolution API\n\n' +
        'Check the error details above for specific failure reasons.';
    }

    // Try to get current webhook status
    console.log('[diagnose-webhook] Checking current webhook status...');
    try {
      const statusResponse = await fetchWithRetry(
        `${baseUrl}/webhook/find/${instanceName}`,
        {
          method: 'GET',
          headers: {
            'apikey': instanceToken,
            'Content-Type': 'application/json',
          },
        },
        { retries: 1, timeoutMs: 10000 }
      );

      if (statusResponse.ok) {
        const currentStatus = await statusResponse.json();
        diagnosticResults['currentWebhookStatus'] = currentStatus;
        console.log('[diagnose-webhook] Current webhook status:', currentStatus);
      } else {
        const errorText = await statusResponse.text();
        diagnosticResults['currentWebhookStatus'] = {
          error: errorText,
          status: statusResponse.status
        };
      }
    } catch (error) {
      console.error('[diagnose-webhook] Could not fetch webhook status:', error);
      diagnosticResults['currentWebhookStatus'] = {
        error: error.message
      };
    }

    console.log('[diagnose-webhook] Diagnostic complete');
    console.log('[diagnose-webhook] Results:', JSON.stringify(diagnosticResults, null, 2));

    return new Response(
      JSON.stringify(diagnosticResults, null, 2),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error) {
    console.error('[diagnose-webhook] Diagnostic error:', error);
    return new Response(
      JSON.stringify({
        error: 'Diagnostic failed',
        message: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
});
