// supabase/functions/evolution-webhook-handler/index.ts
// Handles Evolution webhook events with strict auth and minimal branching.
// Keeps logic simple while delegating per-event work to focused helpers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import {
  verifyHmacSignature,
  checkRateLimit,
  sanitizeError,
  validateWebhookPayload,
} from "../_shared/webhook-security.ts";
import { normalizePhoneNumber } from "../_shared/normalize-phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

// Small helper so every part of the handler normalizes JIDs exactly the same way.
function normalizeJid(jid: string): string {
  return normalizePhoneNumber(jid);
}

// Strip the LID when possible using only the payload data.
// API calls were removed on purpose to keep latency predictable and avoid failures.
async function resolveLidToRealNumber(
  jid: string,
  key: any,
  messageData: any
): Promise<string> {
  console.log("[webhook] Attempting to resolve LID:", jid);

  if (key?.participant) {
    const normalized = normalizeJid(key.participant);
    console.log("[webhook] ✓ Resolved from key.participant:", normalized);
    return normalized;
  }

  if (messageData?.participant) {
    const normalized = normalizeJid(messageData.participant);
    console.log("[webhook] ✓ Resolved from messageData.participant:", normalized);
    return normalized;
  }

  const normalizedFallback = normalizeJid(jid);
  console.warn(
    "[webhook] ⚠️ Using raw LID fallback. Real number unavailable in payload:",
    normalizedFallback
  );
  return normalizedFallback;
}

// Validate webhook authentication using either HMAC or the instance token.
// Returns the auth method when successful; otherwise returns null so the caller can reject.
async function validateWebhookAuth(
  req: Request,
  rawBody: string,
  instanceName?: string
): Promise<string | null> {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const signature = req.headers.get("x-webhook-signature") || "";

  if (webhookSecret && signature) {
    const isValid = await verifyHmacSignature(rawBody, signature, webhookSecret);
    if (isValid) {
      console.log(
        `[webhook-security] ✅ HMAC signature verified for instance: ${instanceName ?? "unknown"}`
      );
      return "HMAC Signature";
    }

    console.error(
      `[webhook-security] ❌ Invalid HMAC signature for instance: ${instanceName ?? "unknown"}`
    );
  }

  const instanceApiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
  if (instanceApiKey && instanceName) {
    const tempSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: instance, error } = await tempSupabase
      .from("evolution_instances")
      .select("instance_token, instance_name")
      .eq("instance_name", instanceName)
      .single();

    if (!error && instance?.instance_token === instanceApiKey) {
      console.log(`[webhook-security] ✅ Instance token verified for: ${instanceName}`);
      return "Instance Token";
    }

    console.error(
      `[webhook-security] ❌ Instance token mismatch for: ${instanceName} (error: ${error?.message ?? "none"})`
    );
  }

  // PERMISSIVE MODE: If no authentication headers provided, verify instance exists
  // Evolution API doesn't send authentication headers by default
  if (instanceName) {
    console.warn("[webhook-security] ⚠️  PERMISSIVE MODE: No authentication headers provided");
    console.warn("[webhook-security] ⚠️  Verifying instance exists in database...");

    const tempSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: validInstance, error: validationError } = await tempSupabase
      .from("evolution_instances")
      .select("id, user_id, instance_name, instance_status")
      .eq("instance_name", instanceName)
      .single();

    if (!validationError && validInstance) {
      console.log(`[webhook-security] ⚠️  PERMISSIVE MODE: Accepting webhook for valid instance: ${instanceName}`);
      console.log(`[webhook-security] ⚠️  Instance belongs to user_id: ${validInstance.user_id}`);
      return "Instance Validated (Permissive Mode)";
    }

    console.error("[webhook-security] ❌ Instance not found in database:", instanceName);
  }

  return null;
}

async function handleQRCodeEvent(
  supabase: ReturnType<typeof createClient>,
  instance: any,
  payload: any
): Promise<void> {
  const instanceName = payload.instance;
  const qrCodeBase64 = payload.data?.qrcode?.base64;

  if (!qrCodeBase64) {
    console.log(
      `[evolution-webhook-handler] QR code payload missing for instance ${instanceName}`
    );
    return;
  }

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

async function handleConnectionEvent(
  supabase: ReturnType<typeof createClient>,
  instance: any,
  payload: any
): Promise<void> {
  const instanceName = payload.instance;
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
      phoneNumber = owner.split("@")[0];
      console.log(`[evolution-webhook-handler] Extracted phone number: ${phoneNumber}`);
    }
  } else if (state === "close") {
    newStatus = "disconnected";
  } else if (state === "connecting") {
    newStatus = "connecting";
  }

  if (!newStatus) {
    return;
  }

  const updateData: any = { instance_status: newStatus };

  if (newStatus === "connected" && phoneNumber) {
    updateData.phone_number = phoneNumber;
    updateData.qr_code = null;
  } else if (newStatus === "disconnected") {
    updateData.phone_number = null;
    updateData.qr_code = null;
  }

  const { error: updateError } = await supabase
    .from("evolution_instances")
    .update(updateData)
    .eq("id", instance.id);

  if (updateError) {
    console.error("[evolution-webhook-handler] Error updating instance:", updateError);
  }
}

async function handleMessageEvent(
  supabase: ReturnType<typeof createClient>,
  instance: any,
  payload: any
): Promise<Response | void> {
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
  const fromMe = key.fromMe ?? false;
  const messageType = messageData.messageType || "unknown";

  let messageText = "";
  if (message.conversation) {
    messageText = message.conversation;
  } else if (message.extendedTextMessage?.text) {
    messageText = message.extendedTextMessage.text;
  } else if (message.text?.text) {
    messageText = message.text.text;
  } else if (message.imageMessage?.caption) {
    messageText = message.imageMessage.caption || "[Image]";
  } else if (message.videoMessage?.caption) {
    messageText = message.videoMessage.caption || "[Video]";
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

  const rawJid = remoteJid;
  const isLid = rawJid.includes("@lid");

  let normalizedKey: string;
  if (isLid) {
    normalizedKey = await resolveLidToRealNumber(rawJid, key, messageData);
  } else {
    normalizedKey = normalizeJid(rawJid);
  }

  if (!normalizedKey) {
    console.error("[webhook] Could not determine contact phone");
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (normalizedKey.endsWith("@g.us")) {
    console.warn("[webhook] Ignoring group message");
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let instancePhone = normalizeJid(instance.phone_number || "");

  if (!instancePhone && payload.sender) {
    instancePhone = normalizeJid(payload.sender);
    console.log(
      `[evolution-webhook-handler] Using sender as instancePhone fallback: ${instancePhone}`
    );

    await supabase
      .from("evolution_instances")
      .update({ phone_number: instancePhone })
      .eq("id", instance.id);
  }

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
    // Safety net - DB trigger handles normalization, this merge keeps legacy rows tidy.
    console.log(
      `[webhook] Found ${existingConvs.length} conversations for contact, merging now...`
    );

    const primary =
      existingConvs.find((c: any) => c.contact_phone === normalizedKey) || existingConvs[0];
    const secondaries = existingConvs.filter((c: any) => c.id !== primary.id);

    console.log(
      `[webhook] Primary conversation: ${primary.id}, merging ${secondaries.length} secondaries`
    );

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

      await supabase.from("conversations").delete().eq("id", secondary.id);

      console.log(`[webhook] Deleted secondary conversation ${secondary.id}`);
    }

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
    const existingConv = existingConvs[0];
    conversationId = existingConv.id;

    console.log(
      "[webhook] Using existing conversation:",
      conversationId,
      "with contact_phone:",
      existingConv.contact_phone
    );

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

    const updateData: any = {
      last_message_text: messageText,
      last_message_at: messageTimestamp,
    };

    if (pushName) {
      updateData.contact_name = pushName;
    }

    if (!fromMe) {
      updateData.unread_count = (existingConv.unread_count || 0) + 1;
    }

    await supabase.from("conversations").update(updateData).eq("id", conversationId);
  } else {
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

  if (!instancePhone) {
    console.warn("[webhook] instancePhone is empty after fallback, using normalizedKey");
  }

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    instance_id: instance.id,
    message_id: key.id,
    sender_phone: fromMe ? instancePhone || normalizedKey : normalizedKey,
    receiver_phone: fromMe ? normalizedKey : instancePhone || normalizedKey,
    direction: fromMe ? "outgoing" : "incoming",
    content: messageText,
    status: "delivered",
    timestamp: messageTimestamp,
  });

  if (msgError) {
    console.error("[webhook] Error storing message:", msgError);
  } else {
    console.log(`[webhook] Message stored in conversation ${conversationId} at ${messageTimestamp}`);
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("ai_enabled")
    .eq("id", conversationId)
    .single();

  if (!fromMe && conversation && conversation.ai_enabled) {
    console.log("[webhook] AI auto-reply enabled for this conversation, triggering...");

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
      .catch((error: unknown) => {
        console.error("[webhook] AI auto-reply invocation error:", error);
      });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const isProduction = Deno.env.get("DENO_ENV") === "production";

  try {
    const clientId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const rateLimit = checkRateLimit(clientId, 100, 60000);

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

    const body = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error("[webhook-security] ❌ Invalid JSON:", parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validationError = validateWebhookPayload(payload);
    if (validationError) {
      console.error("[webhook-security] ❌ Invalid payload:", validationError);
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authMethod = await validateWebhookAuth(req, body, payload.instance);
    if (!authMethod) {
      console.error("[webhook-security] 🚨 SECURITY ALERT: Authentication failed for", clientId);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook-security] ✅ Request authenticated via: ${authMethod}`);

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

    let handlerResponse: Response | void;

    if (event === "qrcode.updated") {
      await handleQRCodeEvent(supabase, instance, payload);
    } else if (event === "connection.update") {
      await handleConnectionEvent(supabase, instance, payload);
    } else if (event === "messages.upsert") {
      handlerResponse = await handleMessageEvent(supabase, instance, payload);
    } else {
      console.log(`[evolution-webhook-handler] Ignoring unsupported event: ${event}`);
    }

    if (handlerResponse) {
      return handlerResponse;
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
