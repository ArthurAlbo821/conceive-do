import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Prestation {
  id: string;
  name: string;
}

export interface Extra {
  id: string;
  name: string;
  price: number;
}

export interface Taboo {
  id: string;
  name: string;
}

export interface Tarif {
  id: string;
  duration: string;
  price: number;
}

export interface UserInformations {
  id?: string;
  user_id?: string;
  prestations: Prestation[];
  extras: Extra[];
  taboos: Taboo[];
  tarifs: Tarif[];
  adresse: string;
}

export const useUserInformations = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: informations, isLoading } = useQuery({
    queryKey: ["user-informations"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_informations")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      // Return default structure if no data exists
      if (!data) {
        return {
          prestations: [],
          extras: [],
          taboos: [],
          tarifs: [],
          adresse: "",
        } as UserInformations;
      }

      // Parse JSONB fields
      return {
        id: data.id,
        user_id: data.user_id,
        prestations: (data.prestations as unknown as Prestation[]) || [],
        extras: (data.extras as unknown as Extra[]) || [],
        taboos: (data.taboos as unknown as Taboo[]) || [],
        tarifs: (data.tarifs as unknown as Tarif[]) || [],
        adresse: data.adresse || "",
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: UserInformations) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_informations")
        .upsert({
          user_id: user.id,
          prestations: data.prestations as any,
          extras: data.extras as any,
          taboos: data.taboos as any,
          tarifs: data.tarifs as any,
          adresse: data.adresse || "",
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-informations"] });
      toast({
        title: "Informations enregistrées",
        description: "Vos informations professionnelles ont été mises à jour avec succès.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible d'enregistrer les informations: ${error.message}`,
      });
    },
  });

  return {
    informations,
    isLoading,
    saveInformations: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
};
