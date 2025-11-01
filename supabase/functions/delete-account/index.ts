/**
 * Delete Account Edge Function
 *
 * Completely deletes a user account and all associated data:
 * - Evolution API instance
 * - User profile
 * - All conversations and messages (via CASCADE)
 * - All appointments
 * - All availabilities
 * - All AI logs (via CASCADE)
 * - All user information (via CASCADE)
 * - Auth user account
 *
 * This action is IRREVERSIBLE.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface DeleteAccountRequest {
  userId: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  try {
    console.log('[delete-account] Starting account deletion process');

    // CORS handling
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[delete-account] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[delete-account] Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`[delete-account] User authenticated: ${userId}`);
    console.log(`[delete-account] Email: ${user.email}`);

    // Create service role client for admin operations
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

    // ============================================================================
    // STEP 1: Get Evolution API instance information
    // ============================================================================
    console.log('[delete-account] Step 1: Retrieving Evolution API instance');

    const { data: instances, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('instance_name, instance_token')
      .eq('user_id', userId)
      .limit(1);

    if (instanceError) {
      console.error('[delete-account] Error fetching instance:', instanceError);
      // Continue anyway - instance might not exist
    }

    const instanceData = instances && instances.length > 0 ? instances[0] : null;

    if (instanceData) {
      console.log(`[delete-account] Found instance: ${instanceData.instance_name}`);
    } else {
      console.log('[delete-account] No Evolution API instance found');
    }

    // ============================================================================
    // STEP 2: Delete Evolution API instance
    // ============================================================================
    if (instanceData) {
      console.log('[delete-account] Step 2: Deleting Evolution API instance');

      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
      const evolutionBaseUrl = (Deno.env.get('EVOLUTION_API_BASE_URL') ??
        'https://cst-evolution-api-kaezwnkk.usecloudstation.com').replace(/\/$/, '');

      try {
        const deleteUrl = `${evolutionBaseUrl}/instance/delete/${instanceData.instance_name}`;
        console.log(`[delete-account] DELETE ${deleteUrl}`);

        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': evolutionApiKey,
            'Content-Type': 'application/json',
          },
        });

        if (deleteResponse.ok) {
          console.log('[delete-account] ✅ Evolution API instance deleted successfully');
        } else {
          const errorText = await deleteResponse.text();
          console.error('[delete-account] ⚠️ Failed to delete Evolution instance:', {
            status: deleteResponse.status,
            error: errorText
          });
          // Continue anyway - we still want to delete the user
        }
      } catch (error) {
        console.error('[delete-account] ⚠️ Exception deleting Evolution instance:', error);
        // Continue anyway
      }
    } else {
      console.log('[delete-account] Step 2: Skipped (no instance to delete)');
    }

    // ============================================================================
    // STEP 3: Delete availabilities (no CASCADE configured)
    // ============================================================================
    console.log('[delete-account] Step 3: Deleting availabilities');

    const { error: availError } = await supabaseAdmin
      .from('availabilities')
      .delete()
      .eq('user_id', userId);

    if (availError) {
      console.error('[delete-account] Error deleting availabilities:', availError);
      // Continue anyway
    } else {
      console.log('[delete-account] ✅ Availabilities deleted');
    }

    // ============================================================================
    // STEP 4: Delete appointments (no CASCADE configured)
    // ============================================================================
    console.log('[delete-account] Step 4: Deleting appointments');

    const { error: apptError } = await supabaseAdmin
      .from('appointments')
      .delete()
      .eq('user_id', userId);

    if (apptError) {
      console.error('[delete-account] Error deleting appointments:', apptError);
      // Continue anyway
    } else {
      console.log('[delete-account] ✅ Appointments deleted');
    }

    // ============================================================================
    // STEP 5: Delete user from auth (triggers CASCADE for remaining tables)
    // ============================================================================
    console.log('[delete-account] Step 5: Deleting user from auth.users');
    console.log('[delete-account] This will CASCADE delete:');
    console.log('[delete-account]   - profiles');
    console.log('[delete-account]   - evolution_instances');
    console.log('[delete-account]   - conversations (via evolution_instances)');
    console.log('[delete-account]   - messages (via conversations)');
    console.log('[delete-account]   - user_informations');
    console.log('[delete-account]   - ai_logs');
    console.log('[delete-account]   - evolution_instance_creation_queue');

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('[delete-account] ❌ CRITICAL: Failed to delete user from auth:', deleteUserError);
      return new Response(
        JSON.stringify({
          error: 'Failed to delete user account',
          details: deleteUserError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[delete-account] ✅ User deleted from auth.users');
    console.log('[delete-account] ✅ CASCADE delete completed for all related tables');

    // ============================================================================
    // STEP 6: Final logging and response
    // ============================================================================
    console.log('[delete-account] 🎉 Account deletion completed successfully');
    console.log(`[delete-account] Deleted user: ${userId} (${user.email})`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account deleted successfully',
        deletedUserId: userId,
        deletedEmail: user.email,
        deletedInstance: instanceData?.instance_name || null,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('[delete-account] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
