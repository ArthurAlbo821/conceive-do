import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useMessages(conversationId: string | null, instanceId?: string | null, contactPhone?: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
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
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then();

    // Normalize JID helper
    const normalizeJid = (jid: string): string => {
      return jid.split('@')[0];
    };

    // Realtime subscription - listen to ALL message inserts for this instance
    const channel = supabase
      .channel(`messages_realtime`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new as any;
          
          // If message is for the currently selected conversation, add it
          if (newMessage.conversation_id === conversationId) {
            setMessages((prev) => [...prev, newMessage]);
          } else if (instanceId && contactPhone) {
            // Check if this message belongs to the same contact (by normalized phone)
            const normalizedContactPhone = normalizeJid(contactPhone);
            const normalizedSender = normalizeJid(newMessage.sender_phone);
            const normalizedReceiver = normalizeJid(newMessage.receiver_phone);
            
            // If sender or receiver matches the current contact's normalized phone
            if (normalizedSender === normalizedContactPhone || normalizedReceiver === normalizedContactPhone) {
              console.log(`[useMessages] Message for same contact detected in different conversation, refetching...`);
              // Refetch messages to get the latest state
              fetchMessages();
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
          const updatedMessage = payload.new as any;
          
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
      const { data, error } = await supabase.functions.invoke(
        "send-whatsapp-message",
        {
          body: { conversation_id: conversationId, message },
        }
      );

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
