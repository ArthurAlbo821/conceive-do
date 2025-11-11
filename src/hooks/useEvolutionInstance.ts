// src/hooks/useEvolutionInstance.ts
// Custom hook for managing Evolution API WhatsApp instance lifecycle
// Simplified: backend cron handles QR refresh, this manages creation + status polling
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EvolutionInstance {
  id: string;
  user_id: string;
  instance_name: string;
  instance_token: string;
  instance_status: "creating" | "disconnected" | "connecting" | "connected" | "error";
  qr_code: string | null;
  phone_number: string | null;
  webhook_url: string;
  last_qr_update: string | null;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const useEvolutionInstance = () => {
  const [instance, setInstance] = useState<EvolutionInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const creationInProgressRef = useRef<boolean>(false);

  // Fetch instance from database
  const fetchInstance = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("evolution_instances")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setInstance(data as EvolutionInstance);
      setError(null);
    } catch (err) {
      console.error("Error fetching instance:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch instance");
    } finally {
      setLoading(false);
    }
  };

  // Create new instance or refresh QR code
  const createInstance = async (options: { forceRefresh?: boolean; silent?: boolean } = {}) => {
    const { forceRefresh = false, silent = false } = options;

    // Guard: Prevent concurrent creation calls (allow forceRefresh to bypass)
    if (creationInProgressRef.current && !forceRefresh) {
      console.log("[useEvolutionInstance] Creation already in progress, skipping duplicate call");
      return;
    }

    creationInProgressRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "create-evolution-instance",
        { body: { forceRefresh } }
      );

      if (functionError) throw functionError;

      if (data?.success && data?.instance) {
        setInstance(data.instance);
        if (!silent) {
          toast({
            title: forceRefresh ? "QR code rafraîchi" : "Instance créée",
            description: forceRefresh
              ? "Scannez le nouveau QR code pour vous connecter."
              : "Votre instance WhatsApp est prête. Scannez le QR code.",
          });
        }
      } else {
        // Special handling for "already in use" errors
        if (data?.details?.includes?.("already in use") || data?.code === "instance_name_in_use") {
          console.log("[useEvolutionInstance] Instance already exists, syncing status...");
          await checkStatus();
          if (!silent) {
            toast({
              title: "Instance existante",
              description: "Synchronisation en cours...",
            });
          }
          return;
        }
        throw new Error(data?.error || "Failed to create instance");
      }
    } catch (err) {
      console.error("Error creating instance:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create instance";
      setError(errorMessage);

      if (!silent) {
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      creationInProgressRef.current = false;
      setLoading(false);
    }
  };

  // Check instance status manually
  const checkStatus = async () => {
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "check-instance-status",
        { body: {} }
      );

      if (functionError) throw functionError;

      if (data?.success) {
        // Refresh instance data
        await fetchInstance();
      }
    } catch (err) {
      console.error("Error checking status:", err);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchInstance();
  }, []);

  // Subscribe to realtime updates for backend-driven state changes
  // Backend cron handles QR refresh every 60s, updates pushed here automatically
  useEffect(() => {
    if (!instance) return;

    const channel = supabase
      .channel("evolution_instances_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "evolution_instances",
          filter: `id=eq.${instance.id}`,
        },
        (payload) => {
          console.log("Instance updated:", payload.new);
          setInstance(payload.new as EvolutionInstance);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instance?.id]);

  // Unified polling with dynamic interval based on status
  // - connecting: 5s (fast detection of connection success)
  // - connected: 15s (detect disconnections)
  // - other statuses: no polling
  useEffect(() => {
    if (!instance) return;

    let interval: number | undefined;

    if (instance.instance_status === "connecting") {
      interval = setInterval(checkStatus, 5000);
    } else if (instance.instance_status === "connected") {
      interval = setInterval(checkStatus, 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [instance?.instance_status]);

  return {
    instance,
    loading,
    error,
    createInstance,
    checkStatus,
    refetch: fetchInstance,
  };
};
