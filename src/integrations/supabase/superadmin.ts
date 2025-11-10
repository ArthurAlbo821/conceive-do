// src/integrations/supabase/superadmin.ts
// Centralises Supabase queries dedicated to the superadmin interface.
// Keep these helpers focused on lightweight data access patterns for future reuse.

import { supabase } from "@/integrations/supabase/client";
import type { ProfileRole } from "@/hooks/useCurrentProfile";

export interface SuperadminStats {
  totalUsers: number;
  totalInstances: number;
  connectedInstances: number;
  messagesLast24h: number;
  aiAutoRepliesLast24h: number;
  appointmentsToday: number;
  recentErrors: AiLogEntry[];
}

export interface AiLogEntry {
  id: string;
  created_at: string;
  event_type: string;
  message: string | null;
  user_id: string;
}

export interface SuperadminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
  instance?: {
    id: string;
    instance_status: string;
    phone_number: string | null;
    updated_at: string;
    last_qr_update: string | null;
  } | null;
  informations?: {
    notification_phone: string | null;
    adresse: string | null;
  } | null;
}

export interface SuperadminInstanceRow {
  id: string;
  instance_name: string;
  instance_status: string;
  last_qr_update: string | null;
  updated_at: string;
  user_id: string;
  user?: {
    email: string;
    full_name: string | null;
    is_active: boolean;
  } | null;
}

export const fetchSuperadminStats = async (): Promise<SuperadminStats> => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [totalUsersRes, totalInstancesRes, connectedInstancesRes, messagesRes, aiRepliesRes, appointmentsRes, recentErrorsRes] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("evolution_instances").select("id", { count: "exact", head: true }),
      supabase
        .from("evolution_instances")
        .select("id", { count: "exact", head: true })
        .eq("instance_status", "connected"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo),
      supabase
        .from("ai_logs")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["message_sent", "ai_response_received"])
        .gte("created_at", twentyFourHoursAgo),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("appointment_date", startOfDay.toISOString().split("T")[0])
        .lt("appointment_date", new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
      supabase
        .from("ai_logs")
        .select("id, created_at, event_type, message, user_id")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const throwIfError = (result: { error: any }) => {
    if (result.error) {
      throw result.error;
    }
  };

  [totalUsersRes, totalInstancesRes, connectedInstancesRes, messagesRes, aiRepliesRes, appointmentsRes, recentErrorsRes].forEach(
    throwIfError
  );

  return {
    totalUsers: totalUsersRes.count ?? 0,
    totalInstances: totalInstancesRes.count ?? 0,
    connectedInstances: connectedInstancesRes.count ?? 0,
    messagesLast24h: messagesRes.count ?? 0,
    aiAutoRepliesLast24h: aiRepliesRes.count ?? 0,
    appointmentsToday: appointmentsRes.count ?? 0,
    recentErrors: (recentErrorsRes.data as AiLogEntry[] | null) ?? [],
  };
};

export const fetchSuperadminUsers = async (search?: string): Promise<SuperadminUserRow[]> => {
  let query = supabase
    .from("profiles")
    .select(
      `id, email, full_name, role, is_active, created_at,
       evolution_instances (id, instance_status, phone_number, updated_at, last_qr_update),
       user_informations (notification_phone, adresse)`
    )
    .order("created_at", { ascending: false });

  if (search && search.trim().length > 0) {
    query = query.ilike("email", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (
    data ?? []
  ).map((row) => ({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: (row.role as ProfileRole) ?? "user",
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    instance: Array.isArray(row.evolution_instances)
      ? row.evolution_instances[0]
      : row.evolution_instances || null,
    informations: Array.isArray(row.user_informations)
      ? row.user_informations[0]
      : row.user_informations || null,
  }));
};

export const toggleUserActive = async (userId: string, isActive: boolean) => {
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) throw error;
};

export const resetUserInstance = async (userId: string) => {
  const { error } = await supabase
    .from("evolution_instances")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
};

export const deleteUserPermanently = async (userId: string) => {
  const { error } = await supabase.rpc("superadmin_delete_user", {
    target_user_id: userId,
  });

  if (error) throw error;
};

export const fetchSuperadminInstances = async (status?: string): Promise<SuperadminInstanceRow[]> => {
  let query = supabase
    .from("evolution_instances")
    .select(
      `id, instance_name, instance_status, last_qr_update, updated_at, user_id,
       profiles (email, full_name, is_active)`
    )
    .order("updated_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("instance_status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    instance_name: row.instance_name,
    instance_status: row.instance_status,
    last_qr_update: row.last_qr_update,
    updated_at: row.updated_at,
    user_id: row.user_id,
    user: row.profiles
      ? {
          email: row.profiles.email,
          full_name: row.profiles.full_name,
          is_active: row.profiles.is_active ?? true,
        }
      : null,
  }));
};

export const refreshInstanceQr = async (instanceId: string) => {
  const { error } = await supabase
    .from("evolution_instances")
    .update({ qr_code: null, last_qr_update: null, instance_status: "connecting" })
    .eq("id", instanceId);

  if (error) throw error;
};

export const fetchInstanceLogs = async (userId: string): Promise<AiLogEntry[]> => {
  const { data, error } = await supabase
    .from("ai_logs")
    .select("id, created_at, event_type, message, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data ?? [];
};
