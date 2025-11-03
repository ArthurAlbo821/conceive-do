import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Conversation {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  last_message_at: string;
  last_message_text: string | null;
  unread_count: number;
  ai_enabled: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  appointment_time?: string | null; // For today's appointments
}

export function useConversations(instanceId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper function to get today's date in Europe/Paris timezone
  const getTodayInParis = () => {
    return new Date().toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-'); // Convert DD/MM/YYYY → YYYY-MM-DD
  };

  // Helper function to fetch appointment time for a conversation
  const fetchAppointmentTime = async (conversationId: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const today = getTodayInParis();
    const { data: aptData } = await supabase
      .from("appointments")
      .select("start_time")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .eq("appointment_date", today)
      .eq("status", "confirmed")
      .maybeSingle();

    return aptData?.start_time || null;
  };

  useEffect(() => {
    if (!instanceId) {
      setLoading(false);
      return;
    }

    const fetchConversations = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Calculate today's date in Europe/Paris timezone to match database
      const today = getTodayInParis();

      // Fetch conversations - simple query without JOIN
      const { data: conversationsData, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .eq("instance_id", instanceId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (convError) {
        console.error("Error fetching conversations:", convError);
        setLoading(false);
        return;
      }

      if (!conversationsData || conversationsData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch today's confirmed appointments separately
      const { data: appointmentsData } = await supabase
        .from("appointments")
        .select("conversation_id, start_time")
        .eq("user_id", user.id)
        .eq("appointment_date", today)
        .eq("status", "confirmed");

      // Create a map of conversation_id -> appointment_time
      const appointmentMap = new Map<string, string>();
      if (appointmentsData) {
        appointmentsData.forEach((apt) => {
          if (apt.conversation_id && apt.start_time) {
            appointmentMap.set(apt.conversation_id, apt.start_time);
          }
        });
      }

      // Transform data to include appointment_time
      const transformedData: Conversation[] = conversationsData.map((conv) => ({
        id: conv.id,
        contact_name: conv.contact_name,
        contact_phone: conv.contact_phone,
        last_message_at: conv.last_message_at,
        last_message_text: conv.last_message_text,
        unread_count: conv.unread_count,
        ai_enabled: conv.ai_enabled,
        is_pinned: conv.is_pinned,
        pinned_at: conv.pinned_at,
        appointment_time: appointmentMap.get(conv.id) || null,
      }));

      // Sort: pinned first (by appointment time), then by last message
      const sorted = transformedData.sort((a: Conversation, b: Conversation) => {
        // Both pinned - sort by appointment time
        if (a.is_pinned && b.is_pinned) {
          if (a.appointment_time && b.appointment_time) {
            return a.appointment_time.localeCompare(b.appointment_time);
          }
          // Fallback to pinned_at if no appointment time
          if (a.pinned_at && b.pinned_at) {
            return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
          }
        }

        // One pinned, one not - pinned comes first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        // Neither pinned - sort by last message
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setConversations(sorted);
      setLoading(false);
    };

    fetchConversations();

    // Realtime subscription
    const channel = supabase
      .channel("conversations_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `instance_id=eq.${instanceId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newConv = payload.new as Conversation;

            // If conversation is pinned, fetch appointment time
            if (newConv.is_pinned) {
              fetchAppointmentTime(newConv.id).then((appointmentTime) => {
                setConversations((prev) => {
                  const updated = [{ ...newConv, appointment_time: appointmentTime }, ...prev];

                  // Re-sort after insert
                  return updated.sort((a, b) => {
                    if (a.is_pinned && b.is_pinned) {
                      if (a.appointment_time && b.appointment_time) {
                        return a.appointment_time.localeCompare(b.appointment_time);
                      }
                      if (a.pinned_at && b.pinned_at) {
                        return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
                      }
                    }
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    if (!a.last_message_at) return 1;
                    if (!b.last_message_at) return -1;
                    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                  });
                });
              });
            } else {
              // Not pinned, just insert normally
              setConversations((prev) => {
                const updated = [newConv, ...prev];

                // Re-sort after insert
                return updated.sort((a, b) => {
                  if (a.is_pinned && b.is_pinned) {
                    if (a.appointment_time && b.appointment_time) {
                      return a.appointment_time.localeCompare(b.appointment_time);
                    }
                    if (a.pinned_at && b.pinned_at) {
                      return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
                    }
                  }
                  if (a.is_pinned && !b.is_pinned) return -1;
                  if (!a.is_pinned && b.is_pinned) return 1;
                  if (!a.last_message_at) return 1;
                  if (!b.last_message_at) return -1;
                  return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                });
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedConv = payload.new as Conversation;

            // If conversation is pinned, fetch appointment time
            if (updatedConv.is_pinned) {
              fetchAppointmentTime(updatedConv.id).then((appointmentTime) => {
                setConversations((prev) => {
                  const updated = prev.map((c) =>
                    c.id === updatedConv.id ? { ...updatedConv, appointment_time: appointmentTime } : c
                  );

                  // Re-sort after update with pinned logic
                  return updated.sort((a, b) => {
                    if (a.is_pinned && b.is_pinned) {
                      if (a.appointment_time && b.appointment_time) {
                        return a.appointment_time.localeCompare(b.appointment_time);
                      }
                      if (a.pinned_at && b.pinned_at) {
                        return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
                      }
                    }
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    if (!a.last_message_at) return 1;
                    if (!b.last_message_at) return -1;
                    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                  });
                });
              });
            } else {
              // Not pinned, just update normally
              setConversations((prev) => {
                const updated = prev.map((c) =>
                  c.id === updatedConv.id ? updatedConv : c
                );

                // Re-sort after update
                return updated.sort((a, b) => {
                  if (a.is_pinned && b.is_pinned) {
                    if (a.appointment_time && b.appointment_time) {
                      return a.appointment_time.localeCompare(b.appointment_time);
                    }
                    if (a.pinned_at && b.pinned_at) {
                      return new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime();
                    }
                  }
                  if (a.is_pinned && !b.is_pinned) return -1;
                  if (!a.is_pinned && b.is_pinned) return 1;
                  if (!a.last_message_at) return 1;
                  if (!b.last_message_at) return -1;
                  return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                });
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId]);

  return { conversations, loading };
}
