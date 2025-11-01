// Edge Function: process-evolution-queue
// Description: Processes queued Evolution API instance creation requests
//              This function is called periodically via cron or can be triggered manually
//              to create Evolution API instances for new users and configure their webhooks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface QueueItem {
  id: string;
  user_id: string;
  request_id: string;
  status: string;
  retry_count: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log('[process-evolution-queue] Starting queue processing...');

    // Get pending items from queue (max 10 at a time to avoid overload)
    const { data: queueItems, error: queueError } = await supabase
      .from('evolution_instance_creation_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', 3) // Max 3 retries
      .order('created_at', { ascending: true })
      .limit(10);

    if (queueError) {
      console.error('[process-evolution-queue] Error fetching queue:', queueError);
      throw queueError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('[process-evolution-queue] No pending items in queue');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending items',
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[process-evolution-queue] Found ${queueItems.length} pending items`);

    const results = {
      success: 0,
      failed: 0,
      items: [] as any[],
    };

    // Process each queue item
    for (const item of queueItems as QueueItem[]) {
      console.log(`[process-evolution-queue] Processing item ${item.id} for user ${item.user_id}`);

      // Mark as processing
      await supabase
        .from('evolution_instance_creation_queue')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      try {
        // Check if instance already exists
        const { data: existingInstance } = await supabase
          .from('evolution_instances')
          .select('id')
          .eq('user_id', item.user_id)
          .single();

        if (existingInstance) {
          console.log(`[process-evolution-queue] Instance already exists for user ${item.user_id}`);

          // Mark as completed
          await supabase
            .from('evolution_instance_creation_queue')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          results.success++;
          results.items.push({
            user_id: item.user_id,
            status: 'completed',
            message: 'Instance already exists',
          });
          continue;
        }

        // Call create-evolution-instance Edge Function
        const createResponse = await fetch(
          `${supabaseUrl}/functions/v1/create-evolution-instance`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: item.user_id,
              fromQueue: true, // Flag to indicate this is from queue processing
            }),
          }
        );

        const createResult = await createResponse.json();

        if (!createResponse.ok) {
          throw new Error(`Failed to create instance: ${JSON.stringify(createResult)}`);
        }

        console.log(`[process-evolution-queue] Successfully created instance for user ${item.user_id}`);

        // Mark as completed
        await supabase
          .from('evolution_instance_creation_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        results.success++;
        results.items.push({
          user_id: item.user_id,
          status: 'completed',
          instance: createResult,
        });

      } catch (error) {
        console.error(`[process-evolution-queue] Error processing item ${item.id}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Increment retry count and mark as failed or pending
        const newRetryCount = item.retry_count + 1;
        const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';

        await supabase
          .from('evolution_instance_creation_queue')
          .update({
            status: newStatus,
            error_message: errorMessage,
            retry_count: newRetryCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        results.failed++;
        results.items.push({
          user_id: item.user_id,
          status: 'failed',
          error: errorMessage,
          retry_count: newRetryCount,
        });
      }
    }

    console.log('[process-evolution-queue] Processing complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        processed: queueItems.length,
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
    console.error('[process-evolution-queue] Fatal error:', error);

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
