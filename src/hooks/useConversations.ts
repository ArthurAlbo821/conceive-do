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
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("instance_id", instanceId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (!error && data) {
        setConversations(data);
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
            setConversations((prev) => [payload.new as Conversation, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setConversations((prev) =>
              prev
                .map((c) =>
                  c.id === (payload.new as Conversation).id ? (payload.new as Conversation) : c
                )
                .sort((a, b) => {
                  if (!a.last_message_at) return 1;
                  if (!b.last_message_at) return -1;
                  return (
                    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
                  );
                })
            );
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
