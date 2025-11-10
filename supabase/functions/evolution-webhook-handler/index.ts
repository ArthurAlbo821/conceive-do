import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import {
  verifyHmacSignature,
  checkRateLimit,
  sanitizeError,
  validateWebhookPayload,
} from "../_shared/webhook-security.ts";
import { normalizePhoneNumber } from "../_shared/normalize-phone.ts";
import { syncMessageToSupermemory } from "../_shared/supermemory.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

// Normalize WhatsApp JID to clean phone number - strict numeric only
// Using shared normalization function for consistency across the entire app
function normalizeJid(jid: string): string {
  return normalizePhoneNumber(jid);
}

// Resolve LID to real phone number by searching in payload or calling Evolution API
async function resolveLidToRealNumber(
  lidJid: string,
  key: any,
  messageData: any,
  instanceName: string
): Promise<string> {
  console.log("[webhook] Attempting to resolve LID:", lidJid);

  // Option A: Try to extract from key.participant
  if (key.participant && !key.participant.includes("@lid")) {
    const resolved = normalizeJid(key.participant);
    console.log("[webhook] ✓ Found real number from key.participant:", resolved);
    return resolved;
  }

  // Option B: Try to extract from messageData.participant
  if (messageData.participant && !messageData.participant.includes("@lid")) {
    const resolved = normalizeJid(messageData.participant);
    console.log("[webhook] ✓ Found real number from messageData.participant:", resolved);
    return resolved;
  }

  // Option C: Call Evolution API to find contacts with remoteJid
  try {
    console.log("[webhook] Calling Evolution API to resolve LID...");
    const evolutionApiUrl =
      Deno.env.get("EVOLUTION_API_URL") ||
      "https://cst-evolution-api-kaezwnkk.usecloudstation.com";
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
    const pushName = messageData.pushName || null;

    if (!evolutionApiKey) {
      console.error("[webhook] EVOLUTION_API_KEY not configured");
      throw new Error("EVOLUTION_API_KEY not configured");
    }

    // Step 1: Try to find contact by remoteJid
    console.log("[webhook] → Query 1: Searching by remoteJid:", lidJid);
    let response = await fetch(`${evolutionApiUrl}/chat/findContacts/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: evolutionApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        where: { remoteJid: lidJid },
      }),
    });

    let contacts = [];
    if (response.ok) {
      contacts = await response.json();
      console.log(
        "[webhook] Evolution API response (by remoteJid):",
        JSON.stringify(contacts)
      );
    } else {
      console.error(
        "[webhook] Evolution API error (remoteJid query):",
        response.status,
        await response.text()
      );
    }

    // Step 2: Fallback to pushName search if first query returns LID or nothing useful
    const hasOnlyLidResult =
      contacts.length > 0 &&
      contacts.every((c: any) => !c.remoteJid || c.remoteJid.includes("@lid"));

    if ((contacts.length === 0 || hasOnlyLidResult) && pushName) {
      console.log("[webhook] → Query 2 (fallback): Searching by pushName:", pushName);
      response = await fetch(`${evolutionApiUrl}/chat/findContacts/${instanceName}`, {
        method: "POST",
        headers: {
          apikey: evolutionApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          where: { pushName: pushName },
        }),
      });

      if (response.ok) {
        contacts = await response.json();
        console.log(
          "[webhook] Evolution API response (by pushName):",
          JSON.stringify(contacts)
        );
      } else {
        console.error(
          "[webhook] Evolution API error (pushName query):",
          response.status,
          await response.text()
        );
      }
    }

    // Step 3: Filter valid candidates
    if (contacts && contacts.length > 0) {
      const candidates = contacts.filter(
        (c: any) =>
          typeof c.remoteJid === "string" &&
          !c.remoteJid.includes("@lid") &&
          !c.remoteJid.endsWith("@g.us")
      );

      console.log("[webhook] Valid candidates found:", candidates.length);

      if (candidates.length > 0) {
        // Step 4: Prioritize by pushName if available
        let bestCandidate = candidates[0];

        if (pushName) {
          const pushNameMatch = candidates.find(
            (c: any) => (c.pushName || "").toLowerCase() === pushName.toLowerCase()
          );
          if (pushNameMatch) {
            bestCandidate = pushNameMatch;
            console.log("[webhook] Found pushName match:", bestCandidate.pushName);
          }
        }

        // Step 5: Validate normalized length (8-15 digits)
        for (const candidate of (bestCandidate === candidates[0]
          ? candidates
          : [bestCandidate, ...candidates])) {
          const normalized = normalizeJid(candidate.remoteJid);
          const numLength = normalized.length;

          console.log("[webhook] Checking candidate:", {
            remoteJid: candidate.remoteJid,
            pushName: candidate.pushName,
            normalized,
            length: numLength,
          });

          if (numLength >= 8 && numLength <= 15) {
            console.log("[webhook] ✓ Found valid real number from Evolution API:", normalized);
            return normalized;
          } else {
            console.log(
              "[webhook] ✗ Rejected candidate (length:",
              numLength,
              "is outside 8-15)"
            );
          }
        }

        console.warn("[webhook] ⚠️ All candidates rejected due to invalid length");
      }
    }
  } catch (error) {
    console.error("[webhook] Error calling Evolution API:", error);
  }

  // Fallback: use the LID number part only if it's >= 8 digits
  const lidNumber = normalizeJid(lidJid);
  if (lidNumber.length >= 8) {
    console.warn("[webhook] ⚠️ Using LID as fallback (length >= 8):", lidNumber);
    return lidNumber;
  } else {
    console.error(
      "[webhook] ❌ LID too short (length < 8), returning empty string:",
      lidNumber
    );
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const isProduction = Deno.env.get("DENO_ENV") === "production";

  try {
    // ═══════════════════════════════════════════════════════════════
    // 🔒 SECURITY LAYER
    // ═══════════════════════════════════════════════════════════════

    // 1. RATE LIMITING
    const clientId =
      req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    const rateLimit = checkRateLimit(clientId, 100, 60000); // 100 req/min

    if (!rateLimit.allowed) {
      console.warn(`[webhook-security] ⚠️  Rate limit exceeded for ${clientId}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": new Date(rateLimit.resetAt).toISOString(),
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      });
    }

    // 2. READ AND PARSE PAYLOAD
    const body = await req.text();
    let payload;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error("[webhook-security] ❌ Invalid JSON:", parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. VALIDATE PAYLOAD STRUCTURE
    const validationError = validateWebhookPayload(payload);
    if (validationError) {
      console.error("[webhook-security] ❌ Invalid payload:", validationError);
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. VERIFY AUTHENTICATION (HMAC or Instance Token) + PERMISSIVE MODE
    // Evolution API doesn't send authentication headers, so we use permissive mode
    // Security is maintained by validating the instance exists in our database

    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const signature = req.headers.get("x-webhook-signature") || "";
    const instanceApiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";

    let authenticated = false;
    let authMethod = "";

    // Try HMAC signature first (if configured and present)
    if (webhookSecret && signature) {
      const isValid = await verifyHmacSignature(body, signature, webhookSecret);
      if (isValid) {
        authenticated = true;
        authMethod = "HMAC Signature";
        console.log(`[webhook-security] ✅ HMAC signature verified for instance: ${payload.instance}`);
      }
    }

    // If HMAC didn't work, try instance token authentication
    if (!authenticated && instanceApiKey && payload.instance) {
      // Create temporary Supabase client to verify token
      const tempSupabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Verify token against database
      const { data: instance, error: instanceError } = await tempSupabase
        .from("evolution_instances")
        .select("instance_token, instance_name")
        .eq("instance_name", payload.instance)
        .single();

      if (!instanceError && instance && instance.instance_token === instanceApiKey) {
        authenticated = true;
        authMethod = "Instance Token";
        console.log(`[webhook-security] ✅ Instance token verified for: ${payload.instance}`);
      }
    }

    // PERMISSIVE MODE: If no authentication headers provided, verify instance exists
    if (!authenticated && payload.instance) {
      console.warn("[webhook-security] ⚠️  PERMISSIVE MODE: No authentication headers provided");
      console.warn("[webhook-security] ⚠️  Verifying instance exists in database...");

      // Create temporary Supabase client to verify instance
      const tempSupabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Check if instance exists and is valid
      const { data: validInstance, error: validationError } = await tempSupabase
        .from("evolution_instances")
        .select("id, user_id, instance_name, instance_status")
        .eq("instance_name", payload.instance)
        .single();

      if (validationError || !validInstance) {
        console.error("[webhook-security] ❌ Instance not found in database:", payload.instance);
        console.error("[webhook-security] 🚨 SECURITY ALERT: Unknown instance from", clientId);

        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authenticated = true;
      authMethod = "Permissive Mode (Instance Validated)";
      console.log(`[webhook-security] ⚠️  PERMISSIVE MODE: Accepting webhook for valid instance: ${payload.instance}`);
      console.log(`[webhook-security] ⚠️  Instance belongs to user_id: ${validInstance.user_id}`);
    }

    // If still not authenticated (no instance name or validation failed), reject
    if (!authenticated) {
      console.error("[webhook-security] 🚨 SECURITY ALERT: Authentication failed from", clientId);
      console.error("[webhook-security] 🚨 No valid authentication method");
      console.error("[webhook-security] 🚨 Payload preview:", body.substring(0, 100));

      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook-security] ✅ Request authenticated via: ${authMethod}`);

    // ═══════════════════════════════════════════════════════════════
    // 🔒 END SECURITY LAYER
    // ═══════════════════════════════════════════════════════════════

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log(
      "[evolution-webhook-handler] Received event:",
      JSON.stringify(payload, null, 2)
    );

    const event = payload.event;
    const instanceName = payload.instance;

    if (!instanceName) {
      console.error("[evolution-webhook-handler] Missing instance name");
      return new Response(JSON.stringify({ success: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the instance in database
    const { data: instance, error: findError } = await supabase
      .from("evolution_instances")
      .select("*")
      .eq("instance_name", instanceName)
      .single();

    if (findError || !instance) {
      console.error("[evolution-webhook-handler] Instance not found:", instanceName);
      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle QRCODE_UPDATED event
    if (event === "qrcode.updated") {
      const qrCodeBase64 = payload.data?.qrcode?.base64;

      if (qrCodeBase64) {
        console.log(`[evolution-webhook-handler] Updating QR code for ${instanceName}`);

        const { error: updateError } = await supabase
          .from("evolution_instances")
          .update({
            qr_code: qrCodeBase64,
            last_qr_update: new Date().toISOString(),
          })
          .eq("id", instance.id);

        if (updateError) {
          console.error("[evolution-webhook-handler] Error updating QR code:", updateError);
        }
      }
    }

    // Handle CONNECTION_UPDATE event
    if (event === "connection.update") {
      const state = payload.data?.state;
      console.log(
        `[evolution-webhook-handler] Connection update for ${instanceName}: ${state}`
      );

      let newStatus: string | null = null;
      let phoneNumber: string | null = null;

      if (state === "open") {
        newStatus = "connected";
        const owner = payload.data?.instance?.owner;
        if (owner) {
          // Extract phone number from owner (format: "33612345678@s.whatsapp.net")
          phoneNumber = owner.split("@")[0];
          console.log(`[evolution-webhook-handler] Extracted phone number: ${phoneNumber}`);
        }
      } else if (state === "close") {
        newStatus = "disconnected";
      } else if (state === "connecting") {
        newStatus = "connecting";
      }

      if (newStatus) {
        const updateData: any = {
          instance_status: newStatus,
        };

        if (newStatus === "connected" && phoneNumber) {
          updateData.phone_number = phoneNumber;
          updateData.qr_code = null; // Clear QR code when connected
        } else if (newStatus === "disconnected") {
          updateData.phone_number = null;
          updateData.qr_code = null;
        }

        const { error: updateError } = await supabase
          .from("evolution_instances")
          .update(updateData)
          .eq("id", instance.id);

        if (updateError) {
          console.error(
            "[evolution-webhook-handler] Error updating connection status:",
            updateError
          );
        } else {
          console.log(`[evolution-webhook-handler] Updated status to ${newStatus}`);
        }
      }
    }

    // Handle MESSAGES_UPSERT event
    if (event === "messages.upsert") {
      const messageData = payload.data;
      const key = messageData?.key;
      const message = messageData?.message;

      if (!key || !message) {
        console.log("[evolution-webhook-handler] Invalid message data");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const remoteJid = key.remoteJid;
      const fromMe = key.fromMe;
      const messageType = messageData.messageType || "unknown";

      // Enhanced content extraction - handle multiple message types
      let messageText = "";
      if (message.conversation) {
        messageText = message.conversation;
      } else if (message.extendedTextMessage?.text) {
        messageText = message.extendedTextMessage.text;
      } else if (message.text?.text) {
        messageText = message.text.text;
      } else if (message.imageMessage?.caption) {
        messageText = message.imageMessage.caption || "[Image]";
      } else if (message.documentMessage?.caption) {
        messageText = message.documentMessage.caption || "[Document]";
      } else if (message.ephemeralMessage?.message?.extendedTextMessage?.text) {
        messageText = message.ephemeralMessage.message.extendedTextMessage.text;
      }

      const pushName = messageData.pushName || null;

      if (!messageText || !remoteJid) {
        console.log(
          `[evolution-webhook-handler] Message ignored - no text content. Type: ${messageType}, remoteJid: ${remoteJid}`
        );
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Normalize phone numbers with LID awareness
      const rawJid = remoteJid;
      const isLid = rawJid.includes("@lid");

      // Resolve LID to real number if detected
      let normalizedKey: string;
      if (isLid) {
        normalizedKey = await resolveLidToRealNumber(rawJid, key, messageData, instanceName);
      } else {
        normalizedKey = normalizeJid(rawJid);
      }

      let instancePhone = normalizeJid(instance.phone_number || "");

      // Fallback: use sender from payload if instancePhone is empty
      if (!instancePhone && payload.sender) {
        instancePhone = normalizeJid(payload.sender);
        console.log(
          `[evolution-webhook-handler] Using sender as instancePhone fallback: ${instancePhone}`
        );

        // Update evolution_instances with the phone number
        await supabase
          .from("evolution_instances")
          .update({ phone_number: instancePhone })
          .eq("id", instance.id);
      }

      // Use correct timestamp from messageData.messageTimestamp
      const messageTimestamp = messageData.messageTimestamp
        ? new Date(messageData.messageTimestamp * 1000).toISOString()
        : new Date().toISOString();

      console.log("[webhook] Message details:", {
        remoteJid,
        rawJid,
        normalizedKey,
        isLid,
        participant: key.participant,
        messageParticipant: messageData.participant,
        fromMe,
        messageType,
        textLength: messageText.length,
        instancePhone,
        pushName,
        timestamp: messageTimestamp,
      });

      // Search for existing conversations using both raw and normalized keys
      const { data: existingConvs, error: searchError } = await supabase
        .from("conversations")
        .select("*")
        .eq("instance_id", instance.id)
        .in("contact_phone", [rawJid, normalizedKey])
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (searchError) {
        console.error("[webhook] Error searching conversations:", searchError);
      }

      let conversationId: string;

      if (existingConvs && existingConvs.length > 1) {
        // Multiple conversations exist - merge them immediately
        console.log(
          `[webhook] Found ${existingConvs.length} conversations for contact, merging now...`
        );

        // Primary: prefer normalized, otherwise most recent
        const primary =
          existingConvs.find((c) => c.contact_phone === normalizedKey) || existingConvs[0];
        const secondaries = existingConvs.filter((c) => c.id !== primary.id);

        console.log(
          `[webhook] Primary conversation: ${primary.id}, merging ${secondaries.length} secondaries`
        );

        // Move all messages from secondaries to primary
        for (const secondary of secondaries) {
          const { data: msgs, error: msgFetchError } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", secondary.id);

          if (!msgFetchError && msgs && msgs.length > 0) {
            await supabase
              .from("messages")
              .update({ conversation_id: primary.id })
              .eq("conversation_id", secondary.id);

            console.log(
              `[webhook] Moved ${msgs.length} messages from ${secondary.id} to ${primary.id}`
            );
          }

          // Aggregate metadata
          primary.unread_count = (primary.unread_count || 0) + (secondary.unread_count || 0);
          if (
            secondary.last_message_at &&
            (!primary.last_message_at || secondary.last_message_at > primary.last_message_at)
          ) {
            primary.last_message_at = secondary.last_message_at;
            primary.last_message_text = secondary.last_message_text;
          }
          if (!primary.contact_name && secondary.contact_name) {
            primary.contact_name = secondary.contact_name;
          }

          // Delete secondary
          await supabase.from("conversations").delete().eq("id", secondary.id);

          console.log(`[webhook] Deleted secondary conversation ${secondary.id}`);
        }

        // Update primary with aggregated data and ensure normalized contact_phone
        await supabase
          .from("conversations")
          .update({
            contact_phone: normalizedKey,
            unread_count: primary.unread_count,
            last_message_at: primary.last_message_at,
            last_message_text: primary.last_message_text,
            contact_name: primary.contact_name || pushName || normalizedKey,
          })
          .eq("id", primary.id);

        conversationId = primary.id;
        console.log(`[webhook] Using merged primary conversation ${conversationId}`);
      } else if (existingConvs && existingConvs.length === 1) {
        // Single conversation exists
        const existingConv = existingConvs[0];
        conversationId = existingConv.id;

        console.log(
          "[webhook] Using existing conversation:",
          conversationId,
          "with contact_phone:",
          existingConv.contact_phone
        );

        // Ensure normalized contact_phone
        if (existingConv.contact_phone !== normalizedKey) {
          console.log(
            "[webhook] Updating contact_phone from",
            existingConv.contact_phone,
            "to",
            normalizedKey
          );
          await supabase
            .from("conversations")
            .update({ contact_phone: normalizedKey })
            .eq("id", conversationId);
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

        await supabase.from("conversations").update(updateData).eq("id", conversationId);
      } else {
        // Create new conversation with normalized key
        console.log("[webhook] Creating new conversation with contact_phone:", normalizedKey);
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
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
          console.error("[webhook] Error creating conversation:", convError);
          return new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        conversationId = newConv.id;
      }

      // Store the message with normalized numbers
      if (!instancePhone) {
        console.warn("[webhook] instancePhone is empty after fallback, using normalizedKey");
      }

      const generatedMessageId = key?.id || `evo_${crypto.randomUUID()}`;

      const syncResult = await syncMessageToSupermemory({
        supabase,
        userId: instance.user_id,
        message: {
          conversation_id: conversationId,
          instance_id: instance.id,
          message_id: generatedMessageId,
          sender_phone: fromMe ? instancePhone || normalizedKey : normalizedKey,
          receiver_phone: fromMe ? normalizedKey : instancePhone || normalizedKey,
          direction: fromMe ? "outgoing" : "incoming",
          content: messageText,
          status: "delivered",
          timestamp: messageTimestamp,
        },
        metadata: {
          source: "evolution-webhook",
          instance_id: instance.id,
          instance_name: instance.instance_name,
        },
      });

      if (syncResult.dbError) {
        console.error("[webhook] Error storing message:", syncResult.dbError);
      } else {
        console.log(`[webhook] Message stored in conversation ${conversationId} at ${messageTimestamp}`);
      }

      if (!syncResult.supermemoryStored && !syncResult.supermemorySkipped) {
        console.warn('[webhook] Supermemory storage failed, message kept via database fallback');
      }

      // Trigger AI auto-reply if enabled for this conversation and message is incoming
      // First, check if AI is enabled for this conversation
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("ai_enabled")
        .eq("id", conversationId)
        .single();

      if (!fromMe && conversation && conversation.ai_enabled) {
        console.log("[webhook] AI auto-reply enabled for this conversation, triggering...");

        // Appel asynchrone (fire-and-forget)
        supabase.functions
          .invoke("ai-auto-reply", {
            body: {
              conversation_id: conversationId,
              instance_id: instance.id,
              user_id: instance.user_id,
              message_text: messageText,
              contact_name: pushName || normalizedKey,
              contact_phone: normalizedKey,
            },
          })
          .catch((error) => {
            console.error("[webhook] AI auto-reply invocation error:", error);
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[webhook] ❌ Error:", error);
    return new Response(JSON.stringify({ error: sanitizeError(error, isProduction) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
