import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendAccessInfoRequest {
  appointment_id: string;
}

interface AccessInfoResponse {
  success: boolean;
  message?: string;
  error?: string;
  message_sent?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log authorization header for debugging
    const authHeader = req.headers.get("Authorization");
    console.log('[send-access-info] Authorization header present:', !!authHeader);

    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace('Bearer ', '');
    console.log('[send-access-info] Token extracted:', token.substring(0, 20) + '...');

    // Create client with ANON_KEY for auth verification
    const supabaseAuthClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get the user from the request by passing the token directly
    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser(token);

    console.log('[send-access-info] User authentication result:', {
      user_id: user?.id,
      has_error: !!userError,
      error_message: userError?.message
    });

    if (userError || !user) {
      console.error('[send-access-info] Authentication failed:', userError);
      throw new Error("Unauthorized");
    }

    // Create client with SERVICE_ROLE_KEY to bypass RLS for data operations
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log('[send-access-info] Using SERVICE_ROLE_KEY for database operations');

    const { appointment_id }: SendAccessInfoRequest = await req.json();

    if (!appointment_id) {
      throw new Error("appointment_id is required");
    }

    console.log('[send-access-info] Fetching appointment:', {
      appointment_id,
      user_id: user.id
    });

    // First, check if appointment exists without user_id filter
    const { data: appointmentCheck } = await supabaseClient
      .from("appointments")
      .select("id, user_id")
      .eq("id", appointment_id)
      .single();

    console.log('[send-access-info] Appointment check:', appointmentCheck);

    // Fetch the appointment with all necessary details
    const { data: appointment, error: appointmentError } = await supabaseClient
      .from("appointments")
      .select(
        `
        id,
        user_id,
        conversation_id,
        contact_name,
        contact_phone,
        appointment_date,
        start_time,
        status,
        client_arrived,
        provider_ready_to_receive
      `
      )
      .eq("id", appointment_id)
      .eq("user_id", user.id)
      .single();

    if (appointmentError || !appointment) {
      console.error("Appointment fetch error:", appointmentError);
      throw new Error("Appointment not found");
    }

    // Validation checks
    if (appointment.status !== "confirmed") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Appointment is not confirmed",
        } as AccessInfoResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!appointment.client_arrived) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Client has not indicated arrival yet",
        } as AccessInfoResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (appointment.provider_ready_to_receive) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Access info already sent for this appointment",
        } as AccessInfoResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    if (!appointment.conversation_id) {
      throw new Error("Appointment has no associated conversation");
    }

    // Fetch user access information
    const { data: userInfo, error: userInfoError } = await supabaseClient
      .from("user_informations")
      .select("door_code, floor, elevator_info, access_instructions")
      .eq("user_id", user.id)
      .single();

    if (userInfoError || !userInfo) {
      console.error("User info fetch error:", userInfoError);
      throw new Error("User access information not found");
    }

    // Check if at least some access info is provided
    if (
      !userInfo.door_code &&
      !userInfo.floor &&
      !userInfo.elevator_info &&
      !userInfo.access_instructions
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "No access information configured. Please add access info in Informations page.",
        } as AccessInfoResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Fetch conversation to get instance details
    const { data: conversation, error: conversationError } =
      await supabaseClient
        .from("conversations")
        .select(
          `
        id,
        contact_phone,
        instance_id,
        evolution_instances (
          id,
          instance_name,
          instance_status
        )
      `
        )
        .eq("id", appointment.conversation_id)
        .single();

    if (conversationError || !conversation) {
      console.error("Conversation fetch error:", conversationError);
      throw new Error("Conversation not found");
    }

    const instance = conversation.evolution_instances as any;

    console.log('[send-access-info] Instance status:', instance?.instance_status);

    if (!instance || instance.instance_status !== "connected") {
      throw new Error("WhatsApp instance is not connected");
    }

    // Build the access info message
    let messageText = "Parfait, tu peux monter ! 🎉\n\n";

    if (userInfo.floor) {
      messageText += `🏢 Étage : ${userInfo.floor}\n`;
    }

    if (userInfo.elevator_info) {
      messageText += `🛗 Ascenseur : ${userInfo.elevator_info}\n`;
    }

    if (userInfo.door_code) {
      messageText += `🔑 Code : ${userInfo.door_code}\n`;
    }

    if (userInfo.access_instructions) {
      messageText += `\nℹ️ Instructions : ${userInfo.access_instructions}`;
    }

    // Send message via Evolution API
    const evolutionApiBaseUrl =
      Deno.env.get("EVOLUTION_API_BASE_URL") ||
      "https://cst-evolution-api-kaezwnkk.usecloudstation.com";
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiKey) {
      throw new Error("Evolution API key not configured");
    }

    const sendMessageUrl = `${evolutionApiBaseUrl}/message/sendText/${instance.instance_name}`;
    const normalizedPhone = conversation.contact_phone.includes("@")
      ? conversation.contact_phone
      : `${conversation.contact_phone}@s.whatsapp.net`;

    const evolutionResponse = await fetch(sendMessageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: messageText,
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error("Evolution API error:", errorText);
      throw new Error(`Failed to send message via Evolution API: ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log("Message sent via Evolution API:", evolutionData);

    // Store the message in the database
    const messageId =
      evolutionData.key?.id || `msg_${Date.now()}_${Math.random()}`;

    await supabaseClient.from("messages").insert({
      conversation_id: conversation.id,
      instance_id: instance.id,
      message_id: messageId,
      sender_phone: instance.instance_name,
      receiver_phone: conversation.contact_phone,
      direction: "outgoing",
      content: messageText,
      status: "sent",
      timestamp: new Date().toISOString(),
    });

    // Update conversation's last message
    await supabaseClient
      .from("conversations")
      .update({
        last_message_text: messageText,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);

    // Update appointment: mark provider as ready
    const { error: updateError } = await supabaseClient
      .from("appointments")
      .update({
        provider_ready_to_receive: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment_id);

    if (updateError) {
      console.error("Failed to update appointment:", updateError);
      // Don't throw - message was sent successfully
    }

    // Log the event
    await supabaseClient.from("ai_logs").insert({
      user_id: user.id,
      conversation_id: conversation.id,
      appointment_id: appointment_id,
      event_type: "access_info_sent",
      event_data: {
        contact_name: appointment.contact_name,
        contact_phone: appointment.contact_phone,
        appointment_time: appointment.start_time,
        has_door_code: !!userInfo.door_code,
        has_floor: !!userInfo.floor,
        has_elevator_info: !!userInfo.elevator_info,
        has_instructions: !!userInfo.access_instructions,
      },
      created_at: new Date().toISOString(),
    });

    // Send notification to provider that access info was sent
    console.log('[send-access-info] Sending notification to provider');
    try {
      await supabaseClient.functions.invoke('send-provider-notification', {
        body: {
          appointment_id: appointment_id,
          notification_type: 'access_info_sent'
        }
      });
    } catch (notifError) {
      // Don't fail the response if notification fails
      console.error('[send-access-info] Failed to send provider notification:', notifError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Access information sent successfully",
        message_sent: true,
      } as AccessInfoResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in send-access-info:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      } as AccessInfoResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
