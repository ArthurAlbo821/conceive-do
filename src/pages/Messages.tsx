import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEvolutionInstance } from "@/hooks/useEvolutionInstance";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";
import { ConversationList } from "@/components/messages/ConversationList";
import { MessageThread } from "@/components/messages/MessageThread";
import { MessageInput } from "@/components/messages/MessageInput";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { instance } = useEvolutionInstance();
  const { conversations, loading: loadingConv } = useConversations(instance?.id);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Find selected conversation to pass contact info to useMessages
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const { messages, sendMessage } = useMessages(
    selectedConversationId,
    instance?.id || null,
    selectedConversation?.contact_phone || null,
    (newId) => setSelectedConversationId(newId)
  );

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversationId) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  const handleToggleAI = async (enabled: boolean) => {
    if (!selectedConversationId) return;

    const { error } = await supabase
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", selectedConversationId);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le paramètre IA",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: enabled ? "IA activée" : "IA désactivée",
      description: enabled
        ? "L'IA répondra automatiquement à ce contact"
        : "L'IA ne répondra plus à ce contact",
    });
  };

  if (!instance || instance.instance_status !== "connected") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Vous devez d'abord connecter votre WhatsApp
              </p>
              <Button onClick={() => navigate("/dashboard")}>Aller à la connexion WhatsApp</Button>
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <div className="flex-1 flex h-full overflow-hidden">
            <div className="w-80 border-r flex flex-col h-full">
              <div className="flex-1 overflow-hidden">
                {loadingConv ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <ConversationList
                    conversations={conversations}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={setSelectedConversationId}
                  />
                )}
              </div>
            </div>
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {selectedConversation ? (
                <>
                  <div className="flex-1 overflow-hidden">
                    <MessageThread
                      messages={messages}
                      contactPhone={selectedConversation.contact_phone}
                      contactName={selectedConversation.contact_name}
                      conversationId={selectedConversationId}
                      aiEnabled={selectedConversation.ai_enabled || false}
                      onToggleAI={handleToggleAI}
                    />
                  </div>
                  <div className="flex-shrink-0 border-t">
                    <MessageInput onSend={(msg) => sendMessage(selectedConversationId!, msg)} />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Sélectionnez une conversation
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Messages;
