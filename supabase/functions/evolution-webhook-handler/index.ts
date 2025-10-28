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
      const messageType = messageData.messageType || 'unknown';
      
      // Enhanced content extraction - handle multiple message types
      let messageText = '';
      if (message.conversation) {
        messageText = message.conversation;
      } else if (message.extendedTextMessage?.text) {
        messageText = message.extendedTextMessage.text;
      } else if (message.text?.text) {
        messageText = message.text.text;
      } else if (message.imageMessage?.caption) {
        messageText = message.imageMessage.caption || '[Image]';
      } else if (message.documentMessage?.caption) {
        messageText = message.documentMessage.caption || '[Document]';
      } else if (message.ephemeralMessage?.message?.extendedTextMessage?.text) {
        messageText = message.ephemeralMessage.message.extendedTextMessage.text;
      }
      
      const pushName = messageData.pushName || null;
      
      if (!messageText || !remoteJid) {
        console.log(`[evolution-webhook-handler] Message ignored - no text content. Type: ${messageType}, remoteJid: ${remoteJid}`);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Normalize phone numbers with LID awareness
      const rawJid = remoteJid;
      const normalizedKey = rawJid.split('@')[0];
      const isLid = rawJid.includes('@lid');
      let instancePhone = normalizeJid(instance.phone_number || '');
      
      // Fallback: use sender from payload if instancePhone is empty
      if (!instancePhone && payload.sender) {
        instancePhone = normalizeJid(payload.sender);
        console.log(`[evolution-webhook-handler] Using sender as instancePhone fallback: ${instancePhone}`);
        
        // Update evolution_instances with the phone number
        await supabase
          .from('evolution_instances')
          .update({ phone_number: instancePhone })
          .eq('id', instance.id);
      }
      
      // Use correct timestamp from messageData.messageTimestamp
      const messageTimestamp = messageData.messageTimestamp 
        ? new Date(messageData.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();
      
      console.log('[webhook] Message details:', {
        remoteJid,
        rawJid,
        normalizedKey,
        isLid,
        fromMe,
        messageType,
        textLength: messageText.length,
        instancePhone,
        timestamp: messageTimestamp
      });

      // Search for existing conversation using both raw and normalized keys
      const { data: existingConvs, error: searchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('instance_id', instance.id)
        .in('contact_phone', [rawJid, normalizedKey])
        .order('last_message_at', { ascending: false });

      if (searchError) {
        console.error('[webhook] Error searching conversations:', searchError);
      }

      let conversationId: string;
      
      if (existingConvs && existingConvs.length > 0) {
        // Use the most recent conversation
        const existingConv = existingConvs[0];
        conversationId = existingConv.id;
        
        console.log('[webhook] Using existing conversation:', conversationId, 'with contact_phone:', existingConv.contact_phone);
        
        // Migrate to normalized key if needed
        if (existingConv.contact_phone !== normalizedKey) {
          console.log('[webhook] Migrating contact_phone from', existingConv.contact_phone, 'to', normalizedKey);
          await supabase
            .from('conversations')
            .update({ contact_phone: normalizedKey })
            .eq('id', conversationId);
        }
        
        // Update existing conversation
        const updateData: any = {
          last_message_text: messageText,
          last_message_at: messageTimestamp,
        };
        
        // Update name if available
        if (pushName) {
          updateData.contact_name = pushName;
        }
        
        // Increment unread_count only for incoming messages
        if (!fromMe) {
          updateData.unread_count = (existingConv.unread_count || 0) + 1;
        }
        
        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', conversationId);
      } else {
        // Create new conversation with normalized key
        console.log('[webhook] Creating new conversation with contact_phone:', normalizedKey);
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: instance.user_id,
            instance_id: instance.id,
            contact_phone: normalizedKey,
            contact_name: pushName || normalizedKey,
            last_message_text: messageText,
            last_message_at: messageTimestamp,
            unread_count: fromMe ? 0 : 1,
          })
          .select()
          .single();
        
        if (convError || !newConv) {
          console.error('[webhook] Error creating conversation:', convError);
          return new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        conversationId = newConv.id;
      }
      
      // Store the message with normalized numbers
      if (!instancePhone) {
        console.warn('[webhook] instancePhone is empty after fallback, using normalizedKey');
      }
      
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          instance_id: instance.id,
          message_id: key.id,
          sender_phone: fromMe ? (instancePhone || normalizedKey) : normalizedKey,
          receiver_phone: fromMe ? normalizedKey : (instancePhone || normalizedKey),
          direction: fromMe ? 'outgoing' : 'incoming',
          content: messageText,
          status: 'delivered',
          timestamp: messageTimestamp,
        });
      
      if (msgError) {
        console.error('[webhook] Error storing message:', msgError);
      } else {
        console.log(`[webhook] Message stored in conversation ${conversationId} at ${messageTimestamp}`);
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
