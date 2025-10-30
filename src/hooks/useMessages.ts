import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export function useMessages(
  conversationId: string | null,
  instanceId?: string | null,
  contactPhone?: string | null,
  onConversationSwitch?: (id: string) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("timestamp", { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
      setLoading(false);
    };

    fetchMessages();

    // Mark as read
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).then();

    // Strict phone number normalization - remove @ suffix and all non-numeric characters
    const normalizePhone = (phone: string): string => {
      if (!phone) return "";
      return phone.split("@")[0].replace(/\D/g, "");
    };

    // Realtime subscription - listen to message inserts for this instance
    const channel = supabase
      .channel(`messages_realtime_${instanceId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: instanceId ? `instance_id=eq.${instanceId}` : undefined,
        },
        (payload) => {
          const newMessage = payload.new as Message;

          // If message is for the currently selected conversation, add it
          if (newMessage.conversation_id === conversationId) {
            setMessages((prev) => [...prev, newMessage]);
          } else if (instanceId && contactPhone) {
            // Check if this message belongs to the same contact (by strictly normalized phone)
            const normalizedContactPhone = normalizePhone(contactPhone);
            const normalizedSender = normalizePhone(newMessage.sender_phone);
            const normalizedReceiver = normalizePhone(newMessage.receiver_phone);

            // If sender or receiver matches the current contact's normalized phone
            if (
              normalizedSender === normalizedContactPhone ||
              normalizedReceiver === normalizedContactPhone
            ) {
              console.log(
                `[useMessages] Message for same contact detected in different conversation (${newMessage.conversation_id}), switching...`
              );
              onConversationSwitch?.(newMessage.conversation_id);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const updatedMessage = payload.new as Message;

          // If a message's conversation_id was updated to our current conversation
          if (updatedMessage.conversation_id === conversationId) {
            console.log(`[useMessages] Message conversation_id updated, refetching...`);
            fetchMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, instanceId, contactPhone]);

  const sendMessage = async (conversationId: string, message: string) => {
    try {
      const { error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: { conversation_id: conversationId, message },
      });

      if (error) throw error;

      toast({
        title: "Message envoyé",
        description: "Votre message a été envoyé avec succès",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le message",
        variant: "destructive",
      });
    }
  };

  return { messages, loading, sendMessage };
}
