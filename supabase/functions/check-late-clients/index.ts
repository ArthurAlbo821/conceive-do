import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Cron job that checks for appointments where:
 * - Appointment time has passed by 5+ minutes
 * - Client has not indicated arrival (client_arrived = false)
 * - No message from client since appointment start time
 *
 * Sends automatic reminder message: "T'es en route ? 😊" or similar
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key for cron jobs (no user auth required)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    const currentTime = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    console.log(`[check-late-clients] Running at ${currentTime}`);

    // Find appointments that are 5+ minutes late
    // Current time minus 5 minutes
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fiveMinutesAgoTime = fiveMinutesAgo.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const { data: lateAppointments, error: appointmentsError } =
      await supabaseClient
        .from("appointments")
        .select(
          `
        id,
        user_id,
        conversation_id,
        contact_name,
        contact_phone,
        start_time,
        client_arrived,
        client_arrival_detected_at
      `
        )
        .eq("appointment_date", now.toISOString().split("T")[0]) // Today only
        .eq("status", "confirmed")
        .eq("client_arrived", false) // Client hasn't indicated arrival
        .is("client_arrival_detected_at", null) // No reminder sent yet
        .lt("start_time", fiveMinutesAgoTime) // Start time was 5+ minutes ago
        .not("conversation_id", "is", null);

    if (appointmentsError) {
      console.error("Error fetching late appointments:", appointmentsError);
      throw appointmentsError;
    }

    if (!lateAppointments || lateAppointments.length === 0) {
      console.log("[check-late-clients] No late appointments found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No late appointments",
          checked_at: now.toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(
      `[check-late-clients] Found ${lateAppointments.length} late appointment(s)`
    );

    const results = [];
    const reminderMessages = [
      "T'es en route ? 😊",
      "Tu es là ? 🙂",
      "T'arrives bientôt ? 😊",
      "Tout va bien ? T'es en chemin ? 🙂",
    ];

    for (const appointment of lateAppointments) {
      try {
        // Fetch conversation with instance details
        const { data: conversation, error: conversationError } =
          await supabaseClient
            .from("conversations")
            .select(
              `
            id,
            contact_phone,
            instance_id,
            last_message_at,
            evolution_instances (
              id,
              instance_name,
              status
            )
          `
            )
            .eq("id", appointment.conversation_id)
            .single();

        if (conversationError || !conversation) {
          console.error(
            `Conversation not found for appointment ${appointment.id}:`,
            conversationError
          );
          results.push({
            appointment_id: appointment.id,
            success: false,
            error: "Conversation not found",
          });
          continue;
        }

        const instance = conversation.evolution_instances as any;

        if (!instance || instance.status !== "connected") {
          console.error(
            `Instance not connected for appointment ${appointment.id}`
          );
          results.push({
            appointment_id: appointment.id,
            success: false,
            error: "Instance not connected",
          });
          continue;
        }

        // Check if client has sent any message since appointment start time
        const appointmentStartDateTime = new Date(
          `${now.toISOString().split("T")[0]}T${appointment.start_time}`
        );

        const { data: recentMessages, error: messagesError } =
          await supabaseClient
            .from("messages")
            .select("id, timestamp, direction")
            .eq("conversation_id", conversation.id)
            .eq("direction", "incoming")
            .gte("timestamp", appointmentStartDateTime.toISOString())
            .order("timestamp", { ascending: false })
            .limit(1);

        if (messagesError) {
          console.error(
            `Error checking messages for appointment ${appointment.id}:`,
            messagesError
          );
        }

        // If client has sent a message since appointment start, skip
        if (recentMessages && recentMessages.length > 0) {
          console.log(
            `Client has sent message since appointment start for ${appointment.id}, skipping reminder`
          );
          results.push({
            appointment_id: appointment.id,
            success: false,
            skipped: true,
            reason: "Client has sent message since appointment start",
          });
          continue;
        }

        // Send reminder message
        const randomMessage =
          reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

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
            text: randomMessage,
          }),
        });

        if (!evolutionResponse.ok) {
          const errorText = await evolutionResponse.text();
          console.error(
            `Evolution API error for appointment ${appointment.id}:`,
            errorText
          );
          results.push({
            appointment_id: appointment.id,
            success: false,
            error: `Evolution API error: ${errorText}`,
          });
          continue;
        }

        const evolutionData = await evolutionResponse.json();
        console.log(
          `Reminder sent for appointment ${appointment.id}:`,
          evolutionData
        );

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
          content: randomMessage,
          status: "sent",
          timestamp: new Date().toISOString(),
        });

        // Update conversation's last message
        await supabaseClient
          .from("conversations")
          .update({
            last_message_text: randomMessage,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        // Update appointment: mark that we've detected/checked arrival
        // (prevents sending multiple reminders)
        await supabaseClient
          .from("appointments")
          .update({
            client_arrival_detected_at: new Date().toISOString(),
          })
          .eq("id", appointment.id);

        // Log the event
        await supabaseClient.from("ai_logs").insert({
          user_id: appointment.user_id,
          conversation_id: conversation.id,
          appointment_id: appointment.id,
          event_type: "late_client_reminder_sent",
          event_data: {
            contact_name: appointment.contact_name,
            contact_phone: appointment.contact_phone,
            appointment_start_time: appointment.start_time,
            reminder_message: randomMessage,
            minutes_late: Math.floor(
              (now.getTime() - appointmentStartDateTime.getTime()) / 60000
            ),
          },
          created_at: new Date().toISOString(),
        });

        results.push({
          appointment_id: appointment.id,
          success: true,
          message_sent: randomMessage,
        });
      } catch (error) {
        console.error(
          `Error processing appointment ${appointment.id}:`,
          error
        );
        results.push({
          appointment_id: appointment.id,
          success: false,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked_at: now.toISOString(),
        appointments_checked: lateAppointments.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-late-clients:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
