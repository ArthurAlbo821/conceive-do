import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface AppointmentExtra {
  name: string;
  price: number;
}

export interface Appointment {
  id: string;
  user_id: string;
  conversation_id?: string;
  contact_name: string;
  contact_phone: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  service?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes?: string;
  selected_extras?: AppointmentExtra[];
  base_price?: number;
  extras_total?: number;
  total_price?: number;
  created_at?: string;
  updated_at?: string;
  client_arrived?: boolean;
  client_arrival_detected_at?: string;
  provider_ready_to_receive?: boolean;
}

export const useAppointments = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("user_id", user.id)
        .order("appointment_date, start_time");

      if (error) throw error;
      return data as Appointment[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (
      appointment: Omit<Appointment, "id" | "user_id" | "created_at" | "updated_at">
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("appointments").insert({
        user_id: user.id,
        ...appointment,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({
        title: "Rendez-vous créé",
        description: "Le rendez-vous a été enregistré avec succès.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de créer le rendez-vous: ${error.message}`,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Appointment> & { id: string }) => {
      const { error } = await supabase.from("appointments").update(updates).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({
        title: "Rendez-vous mis à jour",
        description: "Les modifications ont été enregistrées.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de modifier le rendez-vous: ${error.message}`,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({
        title: "Rendez-vous supprimé",
        description: "Le rendez-vous a été annulé.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de supprimer le rendez-vous: ${error.message}`,
      });
    },
  });

  return {
    appointments: appointments || [],
    isLoading,
    addAppointment: addMutation.mutate,
    updateAppointment: updateMutation.mutate,
    deleteAppointment: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
