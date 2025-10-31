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

      const today = new Date().toISOString().split('T')[0];

      // Fetch conversations with appointment time for today
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          appointments!left(
            id,
            start_time,
            appointment_date,
            status
          )
        `)
        .eq("instance_id", instanceId);

      if (!error && data) {
        // Transform data to include appointment_time for today's appointments
        const transformedData = data.map((conv: any) => {
          const todayAppointment = conv.appointments?.find(
            (apt: any) => apt.appointment_date === today && apt.status === "confirmed"
          );

          return {
            id: conv.id,
            contact_name: conv.contact_name,
            contact_phone: conv.contact_phone,
            last_message_at: conv.last_message_at,
            last_message_text: conv.last_message_text,
            unread_count: conv.unread_count,
            ai_enabled: conv.ai_enabled,
            is_pinned: conv.is_pinned,
            pinned_at: conv.pinned_at,
            appointment_time: todayAppointment?.start_time || null,
          };
        });

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
      }
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
            setConversations((prev) => {
              const newConv = payload.new as Conversation;
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
          } else if (payload.eventType === "UPDATE") {
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === (payload.new as Conversation).id ? (payload.new as Conversation) : c
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
