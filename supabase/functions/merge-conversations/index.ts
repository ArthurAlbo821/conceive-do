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

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[merge-conversations] Starting merge for user ${user.id}`);

    // Find duplicate conversations (same instance_id and contact_phone)
    const { data: conversations, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (fetchError || !conversations) {
      console.error('[merge-conversations] Error fetching conversations:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch conversations' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group conversations by (instance_id, contact_phone)
    const groups = new Map<string, typeof conversations>();
    for (const conv of conversations) {
      const key = `${conv.instance_id}:${conv.contact_phone}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(conv);
    }

    let mergedGroups = 0;
    let movedMessages = 0;
    let deletedConversations = 0;

    // Process each group with duplicates
    for (const [key, convList] of groups.entries()) {
      if (convList.length <= 1) continue; // No duplicates

      console.log(`[merge-conversations] Found ${convList.length} duplicates for ${key}`);

      // Select primary conversation (most recent last_message_at)
      const primary = convList[0]; // Already sorted by last_message_at desc
      const secondaries = convList.slice(1);

      console.log(`[merge-conversations] Primary conversation: ${primary.id}`);

      // Move all messages from secondaries to primary
      for (const secondary of secondaries) {
        const { data: messages, error: msgFetchError } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', secondary.id);

        if (!msgFetchError && messages && messages.length > 0) {
          const { error: updateError } = await supabase
            .from('messages')
            .update({ conversation_id: primary.id })
            .eq('conversation_id', secondary.id);

          if (updateError) {
            console.error(`[merge-conversations] Error moving messages from ${secondary.id}:`, updateError);
          } else {
            console.log(`[merge-conversations] Moved ${messages.length} messages from ${secondary.id} to ${primary.id}`);
            movedMessages += messages.length;
          }
        }
      }

      // Update primary conversation with aggregated data
      let totalUnread = primary.unread_count || 0;
      let mostRecentTimestamp = primary.last_message_at;
      let mostRecentText = primary.last_message_text;
      let bestContactName = primary.contact_name;

      for (const secondary of secondaries) {
        totalUnread += secondary.unread_count || 0;
        
        if (secondary.last_message_at && (!mostRecentTimestamp || secondary.last_message_at > mostRecentTimestamp)) {
          mostRecentTimestamp = secondary.last_message_at;
          mostRecentText = secondary.last_message_text;
        }

        if (!bestContactName && secondary.contact_name) {
          bestContactName = secondary.contact_name;
        }
      }

      const { error: updatePrimaryError } = await supabase
        .from('conversations')
        .update({
          unread_count: totalUnread,
          last_message_at: mostRecentTimestamp,
          last_message_text: mostRecentText,
          contact_name: bestContactName,
        })
        .eq('id', primary.id);

      if (updatePrimaryError) {
        console.error(`[merge-conversations] Error updating primary ${primary.id}:`, updatePrimaryError);
      }

      // Delete secondary conversations
      for (const secondary of secondaries) {
        const { error: deleteError } = await supabase
          .from('conversations')
          .delete()
          .eq('id', secondary.id);

        if (deleteError) {
          console.error(`[merge-conversations] Error deleting ${secondary.id}:`, deleteError);
        } else {
          console.log(`[merge-conversations] Deleted conversation ${secondary.id}`);
          deletedConversations++;
        }
      }

      mergedGroups++;
    }

    console.log(`[merge-conversations] Completed: ${mergedGroups} groups merged, ${movedMessages} messages moved, ${deletedConversations} conversations deleted`);

    return new Response(
      JSON.stringify({
        success: true,
        merged_groups: mergedGroups,
        moved_messages: movedMessages,
        deleted_conversations: deletedConversations,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[merge-conversations] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
