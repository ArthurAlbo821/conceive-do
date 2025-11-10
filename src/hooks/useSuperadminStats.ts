// src/hooks/useSuperadminStats.ts
// Small hook that exposes dashboard metrics for the superadmin area.
// The hook relies on React Query so the UI stays responsive and cache friendly.

import { useQuery } from "@tanstack/react-query";
import { fetchSuperadminStats } from "@/integrations/supabase/superadmin";

export const useSuperadminStats = () =>
  useQuery({
    queryKey: ["superadmin", "stats"],
    queryFn: fetchSuperadminStats,
    refetchInterval: 60 * 1000,
  });
