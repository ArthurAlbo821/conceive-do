import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize WhatsApp JID to clean phone number
function normalizeJid(jid: string): string {
  if (!jid) return '';
  // Remove known suffixes: @s.whatsapp.net, @lid, @g.us, etc.
  return jid.split('@')[0];
}

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

    // Handle MESSAGES_UPSERT event
    if (event === 'messages.upsert') {
      const messageData = payload.data;
      const key = messageData?.key;
      const message = messageData?.message;
      
      if (!key || !message) {
        console.log('[evolution-webhook-handler] Invalid message data');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const remoteJid = key.remoteJid;
      const fromMe = key.fromMe;
      const messageText = message.conversation || message.extendedTextMessage?.text || '';
      const pushName = messageData.pushName || null;
      
      if (!messageText || !remoteJid) {
        console.log('[evolution-webhook-handler] Missing message text or remoteJid');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Normalize phone numbers
      const contactPhone = normalizeJid(remoteJid);
      const instancePhone = normalizeJid(instance.phone_number || '');
      
      console.log(`[evolution-webhook-handler] Processing message from ${contactPhone} (fromMe: ${fromMe})`);
      
      // Créer ou récupérer la conversation
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('instance_id', instance.id)
        .eq('contact_phone', contactPhone)
        .maybeSingle();
      
      let conversationId: string;
      
      if (existingConv) {
        conversationId = existingConv.id;
        
        // Mettre à jour la conversation
        const updateData: any = {
          last_message_text: messageText,
          last_message_at: new Date().toISOString(),
        };
        
        // Mettre à jour le nom si disponible
        if (pushName && !existingConv.contact_name) {
          updateData.contact_name = pushName;
        }
        
        // Incrémenter unread_count seulement si message entrant
        if (!fromMe) {
          updateData.unread_count = (existingConv.unread_count || 0) + 1;
        }
        
        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', conversationId);
      } else {
        // Créer nouvelle conversation
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: instance.user_id,
            instance_id: instance.id,
            contact_phone: contactPhone,
            contact_name: pushName,
            last_message_text: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? 0 : 1,
          })
          .select()
          .single();
        
        if (convError || !newConv) {
          console.error('[evolution-webhook-handler] Error creating conversation:', convError);
          return new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        conversationId = newConv.id;
      }
      
      // Stocker le message avec les numéros normalisés
      if (!instancePhone) {
        console.warn('[evolution-webhook-handler] instancePhone is empty, using contactPhone as fallback');
      }
      
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          instance_id: instance.id,
          message_id: key.id,
          sender_phone: fromMe ? (instancePhone || contactPhone) : contactPhone,
          receiver_phone: fromMe ? contactPhone : (instancePhone || contactPhone),
          direction: fromMe ? 'outgoing' : 'incoming',
          content: messageText,
          status: 'delivered',
          timestamp: message.messageTimestamp 
            ? new Date(message.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        });
      
      if (msgError) {
        console.error('[evolution-webhook-handler] Error storing message:', msgError);
      } else {
        console.log(`[evolution-webhook-handler] Message stored for ${contactPhone}`);
      }
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
