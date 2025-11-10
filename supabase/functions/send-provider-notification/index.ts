import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { normalizePhoneNumber } from "../_shared/normalize-phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  appointment_id: string;
  notification_type: "new_appointment" | "client_arrived" | "access_info_sent";
}

interface NotificationResponse {
  success: boolean;
  message?: string;
  error?: string;
  skipped?: boolean;
}

// Helper to format price with Swiss Franc (CHF)
function formatPrice(price: number): string {
  return `CHF ${price}`;
}

// Helper to format date in French
function formatDateFrench(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Paris",
  };
  return date.toLocaleDateString("fr-FR", options);
}

// Helper to format time (HH:MM:SS to HH:MM)
function formatTime(timeString: string): string {
  if (!timeString) return "";
  const parts = timeString.split(":");
  return `${parts[0]}:${parts[1]}`;
}

// Calculate duration in minutes between two time strings
function calculateDuration(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return endMinutes - startMinutes;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[send-provider-notification] Request received");

    // This function is called by database triggers with SERVICE_ROLE_KEY
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Create Supabase client with SERVICE_ROLE_KEY to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { appointment_id, notification_type }: NotificationRequest =
      await req.json();

    if (!appointment_id || !notification_type) {
      throw new Error("appointment_id and notification_type are required");
    }

    console.log("[send-provider-notification] Processing:", {
      appointment_id,
      notification_type,
    });

    // Fetch the appointment with all necessary details
    const { data: appointment, error: appointmentError } =
      await supabaseClient
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
          end_time,
          duration_minutes,
          service,
          status,
          client_arrived,
          provider_ready_to_receive,
          notes
        `
        )
        .eq("id", appointment_id)
        .single();

    if (appointmentError || !appointment) {
      console.error(
        "[send-provider-notification] Appointment fetch error:",
        appointmentError
      );
      throw new Error("Appointment not found");
    }

    console.log("[send-provider-notification] Appointment found:", {
      user_id: appointment.user_id,
      contact_name: appointment.contact_name,
    });

    // Fetch user information including notification_phone
    const { data: userInfo, error: userInfoError } = await supabaseClient
      .from("user_informations")
      .select("notification_phone")
      .eq("user_id", appointment.user_id)
      .single();

    if (userInfoError) {
      console.error(
        "[send-provider-notification] User info fetch error:",
        userInfoError
      );
      throw new Error("User information not found");
    }

    // If notification_phone is not configured, skip silently
    if (!userInfo.notification_phone) {
      console.log(
        "[send-provider-notification] No notification_phone configured, skipping"
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "Notification skipped - no phone configured",
          skipped: true,
        } as NotificationResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Normalize the notification phone
    const normalizedNotificationPhone = normalizePhoneNumber(
      userInfo.notification_phone
    );
    console.log("[send-provider-notification] Notification phone:", {
      original: userInfo.notification_phone,
      normalized: normalizedNotificationPhone,
    });

    // Check if notification already sent (prevent duplicates)
    const { data: existingNotification } = await supabaseClient
      .from("appointment_notifications")
      .select("id")
      .eq("appointment_id", appointment_id)
      .eq("notification_type", notification_type)
      .single();

    if (existingNotification) {
      console.log(
        "[send-provider-notification] Notification already sent, skipping"
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "Notification already sent",
          skipped: true,
        } as NotificationResponse),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Fetch the provider's Evolution instance
    const { data: instance, error: instanceError } = await supabaseClient
      .from("evolution_instances")
      .select("id, instance_name, instance_status")
      .eq("user_id", appointment.user_id)
      .single();

    if (instanceError || !instance) {
      console.error(
        "[send-provider-notification] Evolution instance fetch error:",
        instanceError
      );
      throw new Error("Evolution instance not found");
    }

    if (instance.instance_status !== "connected") {
      console.error(
        "[send-provider-notification] Instance not connected:",
        instance.instance_status
      );
      throw new Error(
        `WhatsApp instance is not connected (status: ${instance.instance_status})`
      );
    }

    // Format the message based on notification type
    let messageText = "";

    switch (notification_type) {
      case "new_appointment": {
        const duration = appointment.duration_minutes ||
          calculateDuration(appointment.start_time, appointment.end_time);

        messageText = `🤖 Nouveau RDV

👤 Client : ${appointment.contact_name} (${appointment.contact_phone})
📅 Date : ${formatDateFrench(appointment.appointment_date)}
🕐 Heure : ${formatTime(appointment.start_time)} - ${formatTime(appointment.end_time)} (${duration}min)

📋 Service : ${appointment.service || "Prestation"}`;

        // Display structured extras with prices if available
        if (appointment.selected_extras && Array.isArray(appointment.selected_extras) && appointment.selected_extras.length > 0) {
          messageText += `\n\n💎 Extras :`;
          appointment.selected_extras.forEach((extra: any) => {
            messageText += `\n• ${extra.name} (${formatPrice(extra.price)})`;
          });
        }

        // Display price breakdown if available
        if (appointment.total_price !== null && appointment.total_price !== undefined) {
          messageText += `\n\n💰 Prix total : ${formatPrice(appointment.total_price)}`;

          if (appointment.base_price !== null && appointment.base_price !== undefined) {
            messageText += `\n   (Base: ${formatPrice(appointment.base_price)}`;
            if (appointment.extras_total && appointment.extras_total > 0) {
              messageText += ` + Extras: ${formatPrice(appointment.extras_total)}`;
            }
            messageText += `)`;
          }
        }

        break;
      }

      case "client_arrived": {
        messageText = `🚶 Client arrivé !

👤 ${appointment.contact_name} est arrivé pour le rendez-vous de ${formatTime(appointment.start_time)}.

📱 Rendez-vous dans l'app pour envoyer les infos d'accès.`;
        break;
      }

      case "access_info_sent": {
        messageText = `✅ Infos d'accès envoyées

Les informations d'accès ont été envoyées à ${appointment.contact_name} pour le RDV de ${formatTime(appointment.start_time)}.`;
        break;
      }

      default:
        throw new Error(`Unknown notification type: ${notification_type}`);
    }

    console.log("[send-provider-notification] Message formatted:", {
      type: notification_type,
      length: messageText.length,
    });

    // Send message via Evolution API
    const evolutionApiBaseUrl =
      Deno.env.get("EVOLUTION_API_BASE_URL") ||
      "https://cst-evolution-api-kaezwnkk.usecloudstation.com";
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiKey) {
      throw new Error("Evolution API key not configured");
    }

    const sendMessageUrl = `${evolutionApiBaseUrl}/message/sendText/${instance.instance_name}`;

    // Format phone number for WhatsApp (add @s.whatsapp.net suffix)
    const whatsappNumber = normalizedNotificationPhone.includes("@")
      ? normalizedNotificationPhone
      : `${normalizedNotificationPhone}@s.whatsapp.net`;

    console.log("[send-provider-notification] Sending to Evolution API:", {
      url: sendMessageUrl,
      instance: instance.instance_name,
      recipient: whatsappNumber,
    });

    const evolutionResponse = await fetch(sendMessageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: whatsappNumber,
        text: messageText,
      }),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error(
        "[send-provider-notification] Evolution API error:",
        errorText
      );

      // Log failed notification
      await supabaseClient.from("appointment_notifications").insert({
        appointment_id: appointment_id,
        user_id: appointment.user_id,
        notification_type: notification_type,
        message_text: messageText,
        status: "failed",
        error_details: {
          error: errorText,
          evolution_status: evolutionResponse.status,
        },
      });

      throw new Error(`Failed to send message via Evolution API: ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log(
      "[send-provider-notification] Message sent successfully:",
      evolutionData
    );

    // Log successful notification
    await supabaseClient.from("appointment_notifications").insert({
      appointment_id: appointment_id,
      user_id: appointment.user_id,
      notification_type: notification_type,
      message_text: messageText,
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    // Also log to ai_logs for comprehensive audit trail
    await supabaseClient.from("ai_logs").insert({
      user_id: appointment.user_id,
      conversation_id: appointment.conversation_id,
      appointment_id: appointment_id,
      event_type: `notification_${notification_type}`,
      event_data: {
        notification_type: notification_type,
        recipient: normalizedNotificationPhone,
        message_length: messageText.length,
        evolution_response: evolutionData,
      },
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notification sent successfully",
      } as NotificationResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[send-provider-notification] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      } as NotificationResponse),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
