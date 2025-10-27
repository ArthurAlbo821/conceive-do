import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EvolutionInstance {
  id: string;
  user_id: string;
  instance_name: string;
  instance_token: string;
  instance_status: 'creating' | 'disconnected' | 'connecting' | 'connected' | 'error';
  qr_code: string | null;
  phone_number: string | null;
  webhook_url: string;
  last_qr_update: string | null;
  created_at: string;
  updated_at: string;
}

export const useEvolutionInstance = () => {
  const [instance, setInstance] = useState<EvolutionInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const lastAutoRefreshFromRef = useRef<string | null>(null);

  // Fetch instance from database
  const fetchInstance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setInstance(data as EvolutionInstance);
      setError(null);
    } catch (err) {
      console.error('Error fetching instance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch instance');
    } finally {
      setLoading(false);
    }
  };

  // Create new instance or refresh QR code
  const createInstance = async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'create-evolution-instance',
        { body: { forceRefresh: forceRefresh || false } }
      );

      if (functionError) throw functionError;

      if (data?.success && data?.instance) {
        setInstance(data.instance);
        toast({
          title: forceRefresh ? 'QR code rafraîchi' : 'Instance créée',
          description: forceRefresh 
            ? 'Scannez le nouveau QR code pour vous connecter.' 
            : 'Votre instance WhatsApp est prête. Scannez le QR code.',
        });
      } else {
        throw new Error(data?.error || 'Failed to create instance');
      }
    } catch (err) {
      console.error('Error creating instance:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create instance';
      setError(errorMessage);
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Check instance status manually
  const checkStatus = async () => {
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'check-instance-status',
        { body: {} }
      );

      if (functionError) throw functionError;

      if (data?.success) {
        // Refresh instance data
        await fetchInstance();
      }
    } catch (err) {
      console.error('Error checking status:', err);
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
      .channel('evolution_instances_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'evolution_instances',
          filter: `id=eq.${instance.id}`,
        },
        (payload) => {
          console.log('Instance updated:', payload.new);
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
    if (instance?.instance_status === 'connecting') {
      const interval = setInterval(() => {
        checkStatus();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [instance?.instance_status]);

  // Continuous polling when status is 'connected' to detect disconnections
  useEffect(() => {
    if (instance?.instance_status === 'connected') {
      const interval = setInterval(() => {
        checkStatus();
      }, 15000); // Poll every 15 seconds for connected instances

      return () => clearInterval(interval);
    }
  }, [instance?.instance_status]);

  // Auto-refresh QR code before expiration
  useEffect(() => {
    if (!instance || instance.instance_status !== 'connecting' || !instance.last_qr_update || !instance.qr_code) {
      return;
    }

    const checkAndRefreshQR = () => {
      const lastUpdate = new Date(instance.last_qr_update!).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - lastUpdate) / 1000);

      // Refresh at 110 seconds (10 seconds before expiration) - guarded to run once per QR
      if (elapsed >= 110 && lastAutoRefreshFromRef.current !== instance.last_qr_update) {
        console.log('[useEvolutionInstance] Auto-refreshing QR code at 1:50');
        lastAutoRefreshFromRef.current = instance.last_qr_update!;
        createInstance(true); // forceRefresh = true
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkAndRefreshQR, 5000);

    return () => clearInterval(interval);
  }, [instance?.last_qr_update, instance?.instance_status, instance?.qr_code]);

  // Auto-recovery: if disconnected but never connected, regenerate QR
  useEffect(() => {
    if (
      instance?.instance_status === 'disconnected' && 
      !instance.phone_number && // Never connected
      !loading
    ) {
      console.log('[useEvolutionInstance] Instance disconnected without ever connecting, attempting recovery');
      createInstance(true);
    }
  }, [instance?.instance_status, instance?.phone_number, loading]);

  return {
    instance,
    loading,
    error,
    createInstance,
    checkStatus,
    refetch: fetchInstance,
  };
};
