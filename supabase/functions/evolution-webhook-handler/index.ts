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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log('[evolution-webhook-handler] Received event:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    const instanceName = payload.instance;

    if (!instanceName) {
      console.error('[evolution-webhook-handler] Missing instance name');
      return new Response(JSON.stringify({ success: false }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the instance in database
    const { data: instance, error: findError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('instance_name', instanceName)
      .single();

    if (findError || !instance) {
      console.error('[evolution-webhook-handler] Instance not found:', instanceName);
      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle QRCODE_UPDATED event
    if (event === 'qrcode.updated') {
      const qrCodeBase64 = payload.data?.qrcode?.base64;
      
      if (qrCodeBase64) {
        console.log(`[evolution-webhook-handler] Updating QR code for ${instanceName}`);
        
        const { error: updateError } = await supabase
          .from('evolution_instances')
          .update({
            qr_code: qrCodeBase64,
            last_qr_update: new Date().toISOString(),
          })
          .eq('id', instance.id);

        if (updateError) {
          console.error('[evolution-webhook-handler] Error updating QR code:', updateError);
        }
      }
    }

    // Handle CONNECTION_UPDATE event
    if (event === 'connection.update') {
      const state = payload.data?.state;
      console.log(`[evolution-webhook-handler] Connection update for ${instanceName}: ${state}`);

      let newStatus: string | null = null;
      let phoneNumber: string | null = null;

      if (state === 'open') {
        newStatus = 'connected';
        const owner = payload.data?.instance?.owner;
        if (owner) {
          // Extract phone number from owner (format: "33612345678@s.whatsapp.net")
          phoneNumber = owner.split('@')[0];
          console.log(`[evolution-webhook-handler] Extracted phone number: ${phoneNumber}`);
        }
      } else if (state === 'close') {
        newStatus = 'disconnected';
      } else if (state === 'connecting') {
        newStatus = 'connecting';
      }

      if (newStatus) {
        const updateData: any = {
          instance_status: newStatus,
        };

        if (newStatus === 'connected' && phoneNumber) {
          updateData.phone_number = phoneNumber;
          updateData.qr_code = null; // Clear QR code when connected
        } else if (newStatus === 'disconnected') {
          updateData.phone_number = null;
          updateData.qr_code = null;
        }

        const { error: updateError } = await supabase
          .from('evolution_instances')
          .update(updateData)
          .eq('id', instance.id);

        if (updateError) {
          console.error('[evolution-webhook-handler] Error updating connection status:', updateError);
        } else {
          console.log(`[evolution-webhook-handler] Updated status to ${newStatus}`);
        }
      }
    }

    // Handle MESSAGES_UPSERT event (log only for now)
    if (event === 'messages.upsert') {
      console.log(`[evolution-webhook-handler] Message received for ${instanceName}:`, 
        JSON.stringify(payload.data, null, 2));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[evolution-webhook-handler] Error:', error);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
