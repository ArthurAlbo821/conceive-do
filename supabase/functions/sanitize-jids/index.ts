import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize WhatsApp JID to clean phone number
function normalizeJid(jid: string): string {
  if (!jid) return '';
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

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sanitize-jids] Starting sanitization for user ${user.id}`);

    // Get all conversations for this user that might have unnormalized JIDs
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id);

    if (convError) {
      console.error('[sanitize-jids] Error fetching conversations:', convError);
      return new Response(JSON.stringify({ error: 'Failed to fetch conversations' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updatedConvCount = 0;
    let updatedMsgCount = 0;

    // Process each conversation
    for (const conv of conversations || []) {
      const originalPhone = conv.contact_phone;
      const normalizedPhone = normalizeJid(originalPhone);

      // If the phone contains @ symbols or other suffixes, normalize it
      if (originalPhone !== normalizedPhone) {
        console.log(`[sanitize-jids] Normalizing conversation ${conv.id}: ${originalPhone} -> ${normalizedPhone}`);
        
        const { error: updateError } = await supabase
          .from('conversations')
          .update({ contact_phone: normalizedPhone })
          .eq('id', conv.id);

        if (updateError) {
          // Check if it's a duplicate key error
          if (updateError.code === '23505') {
            console.log(`[sanitize-jids] Duplicate key detected for ${normalizedPhone}, merging conversations...`);
            
            // Find the target conversation that already has this normalized phone
            const { data: targetConv, error: targetError } = await supabase
              .from('conversations')
              .select('*')
              .eq('instance_id', conv.instance_id)
              .eq('contact_phone', normalizedPhone)
              .single();

            if (targetError || !targetConv) {
              console.error(`[sanitize-jids] Error finding target conversation:`, targetError);
              continue;
            }

            console.log(`[sanitize-jids] Target conversation: ${targetConv.id}, merging from ${conv.id}`);

            // Move messages from current conversation to target
            const { data: msgs, error: msgFetchError } = await supabase
              .from('messages')
              .select('id')
              .eq('conversation_id', conv.id);

            if (!msgFetchError && msgs && msgs.length > 0) {
              await supabase
                .from('messages')
                .update({ conversation_id: targetConv.id })
                .eq('conversation_id', conv.id);

              console.log(`[sanitize-jids] Moved ${msgs.length} messages from ${conv.id} to ${targetConv.id}`);
            }

            // Aggregate metadata
            const aggregatedUnread = (targetConv.unread_count || 0) + (conv.unread_count || 0);
            let finalLastMessageAt = targetConv.last_message_at;
            let finalLastMessageText = targetConv.last_message_text;
            
            if (conv.last_message_at && (!targetConv.last_message_at || conv.last_message_at > targetConv.last_message_at)) {
              finalLastMessageAt = conv.last_message_at;
              finalLastMessageText = conv.last_message_text;
            }

            const finalContactName = targetConv.contact_name || conv.contact_name;

            // Update target with aggregated data
            await supabase
              .from('conversations')
              .update({
                unread_count: aggregatedUnread,
                last_message_at: finalLastMessageAt,
                last_message_text: finalLastMessageText,
                contact_name: finalContactName,
              })
              .eq('id', targetConv.id);

            // Delete current conversation
            await supabase
              .from('conversations')
              .delete()
              .eq('id', conv.id);

            console.log(`[sanitize-jids] Deleted duplicate conversation ${conv.id}`);
            updatedConvCount++;
          } else {
            console.error(`[sanitize-jids] Error updating conversation ${conv.id}:`, updateError);
          }
        } else {
          updatedConvCount++;
        }
      }

      // Also normalize messages for this conversation
      const { data: messages, error: msgFetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id);

      if (msgFetchError) {
        console.error(`[sanitize-jids] Error fetching messages for conversation ${conv.id}:`, msgFetchError);
        continue;
      }

      for (const msg of messages || []) {
        const normalizedSender = normalizeJid(msg.sender_phone);
        const normalizedReceiver = normalizeJid(msg.receiver_phone);

        if (msg.sender_phone !== normalizedSender || msg.receiver_phone !== normalizedReceiver) {
          console.log(`[sanitize-jids] Normalizing message ${msg.id}`);
          
          const { error: msgUpdateError } = await supabase
            .from('messages')
            .update({
              sender_phone: normalizedSender,
              receiver_phone: normalizedReceiver,
            })
            .eq('id', msg.id);

          if (msgUpdateError) {
            console.error(`[sanitize-jids] Error updating message ${msg.id}:`, msgUpdateError);
          } else {
            updatedMsgCount++;
          }
        }
      }
    }

    console.log(`[sanitize-jids] Sanitization complete: ${updatedConvCount} conversations, ${updatedMsgCount} messages updated`);

    return new Response(
      JSON.stringify({
        success: true,
        updated_conversations: updatedConvCount,
        updated_messages: updatedMsgCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sanitize-jids] Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
