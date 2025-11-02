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
  const lastAutoRefreshFromRef = useRef<string | null>(null);
  const lastRecoveryAttemptRef = useRef<number>(0);
  const lastErrorToastRef = useRef<number>(0);
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

      // Deduplicate error toasts (30s cooldown for non-silent calls)
      if (!silent) {
        const now = Date.now();
        if (now - lastErrorToastRef.current > 30000) {
          lastErrorToastRef.current = now;
          toast({
            title: "Erreur",
            description: errorMessage,
            variant: "destructive",
          });
        }
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

  // Subscribe to realtime updates
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

  // Polling when status is 'connecting'
  useEffect(() => {
    if (instance?.instance_status === "connecting") {
      const interval = setInterval(() => {
        checkStatus();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [instance?.instance_status]);

  // Continuous polling when status is 'connected' to detect disconnections
  useEffect(() => {
    if (instance?.instance_status === "connected") {
      const interval = setInterval(() => {
        checkStatus();
      }, 15000); // Poll every 15 seconds for connected instances

      return () => clearInterval(interval);
    }
  }, [instance?.instance_status]);

  // Auto-refresh QR code - NOW HANDLED BY BACKEND CRON JOB
  // QR codes are automatically refreshed every 60 seconds by the refresh-qr-codes Edge Function
  // The real-time subscription below will receive and display updates automatically
  //
  // Previous behavior: Frontend refreshed at 110 seconds (1:50)
  // New behavior: Backend cron refreshes every 60 seconds, updates pushed via real-time
  //
  // This effect is intentionally disabled to prevent duplicate refresh requests
  useEffect(() => {
    // Disabled - QR refresh is now managed by backend cron job
    // The real-time subscription in the earlier useEffect handles UI updates
    console.log("[useEvolutionInstance] QR auto-refresh handled by backend cron (every 60s)");
    return () => {}; // No-op cleanup
  }, [instance?.last_qr_update, instance?.instance_status, instance?.qr_code]);

  // Auto-recovery: if connecting but no QR code, try to get one (with cooldown)
  useEffect(() => {
    if (instance?.instance_status === "connecting" && !instance.qr_code && !loading) {
      const now = Date.now();
      const cooldown = 60000; // 60 seconds between recovery attempts

      // Skip auto-recovery if instance was just created (within last 10 seconds)
      // to avoid triggering recovery on brand new instances still waiting for initial QR
      const instanceAge = instance.created_at ? now - new Date(instance.created_at).getTime() : Infinity;
      const justCreated = instanceAge < 10000;  // Less than 10 seconds old

      if (justCreated) {
        console.log("[useEvolutionInstance] Instance just created, skipping auto-recovery (waiting for initial QR)");
        return;
      }

      if (now - lastRecoveryAttemptRef.current > cooldown) {
        console.log(
          "[useEvolutionInstance] Auto-recovering QR code for connecting instance (silent)"
        );
        lastRecoveryAttemptRef.current = now;
        createInstance({ forceRefresh: true, silent: true });
      }
    }
  }, [instance?.instance_status, instance?.qr_code, instance?.created_at, loading]);

  return {
    instance,
    loading,
    error,
    createInstance,
    checkStatus,
    refetch: fetchInstance,
  };
};
