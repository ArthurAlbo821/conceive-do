import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Availability {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const useAvailabilities = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: availabilities, isLoading } = useQuery({
    queryKey: ["availabilities"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("availabilities")
        .select("*")
        .eq("user_id", user.id)
        .order("day_of_week, start_time");

      if (error) throw error;
      return data as Availability[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (availability: Omit<Availability, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("availabilities")
        .insert({
          user_id: user.id,
          ...availability,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availabilities"] });
      toast({
        title: "Disponibilité ajoutée",
        description: "Votre horaire a été enregistré avec succès.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible d'ajouter la disponibilité: ${error.message}`,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Availability> & { id: string }) => {
      const { error } = await supabase
        .from("availabilities")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availabilities"] });
      toast({
        title: "Disponibilité mise à jour",
        description: "Vos modifications ont été enregistrées.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de modifier la disponibilité: ${error.message}`,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("availabilities")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availabilities"] });
      toast({
        title: "Disponibilité supprimée",
        description: "L'horaire a été retiré.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de supprimer la disponibilité: ${error.message}`,
      });
    },
  });

  return {
    availabilities: availabilities || [],
    isLoading,
    addAvailability: addMutation.mutate,
    updateAvailability: updateMutation.mutate,
    deleteAvailability: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
