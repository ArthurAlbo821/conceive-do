// src/hooks/useCurrentProfile.ts
// Provides a lightweight hook to fetch the authenticated user's profile and role.
// This hook intentionally avoids fetching heavy relations to stay fast and cache friendly.

import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ProfileRole = "user" | "superadmin";

export interface CurrentProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: ProfileRole;
  is_active: boolean;
}

export interface UseCurrentProfileResult {
  profile: CurrentProfile | null;
  isLoading: boolean;
  error: PostgrestError | null;
  refetch: () => Promise<CurrentProfile | null>;
}

export const useCurrentProfile = (): UseCurrentProfileResult => {
  const query = useQuery<CurrentProfile | null, PostgrestError>({
    queryKey: ["current-profile"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: (data.role as ProfileRole) ?? "user",
        is_active: data.is_active ?? true,
      };
    },
    staleTime: 60 * 1000,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: async () => {
      const result = await query.refetch();
      return result.data ?? null;
    },
  };
};
