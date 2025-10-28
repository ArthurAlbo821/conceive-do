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
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { instance } = useEvolutionInstance();
  const { conversations, loading: loadingConv } = useConversations(instance?.id);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  // Find selected conversation to pass contact info to useMessages
  const selectedConversation = conversations.find(c => c.id === selectedConversationId);
  
  const { messages, sendMessage } = useMessages(
    selectedConversationId, 
    instance?.id || null,
    selectedConversation?.contact_phone || null,
    (newId) => setSelectedConversationId(newId)
  );
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
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

  const handleMergeConversations = async () => {
    setMerging(true);
    try {
      // First sanitize JIDs to normalize @lid entries
      const { error: sanitizeError } = await supabase.functions.invoke('sanitize-jids');
      if (sanitizeError) {
        console.error('Error sanitizing JIDs:', sanitizeError);
      }
      
      // Then merge duplicate conversations
      const { data, error } = await supabase.functions.invoke('merge-conversations');
      
      if (error) throw error;
      
      toast({
        title: "Conversations fusionnées",
        description: `${data.merged_groups} groupes fusionnés, ${data.moved_messages} messages déplacés`,
      });
      
      // Refetch conversations
      window.location.reload();
    } catch (error) {
      console.error('Error merging conversations:', error);
      toast({
        title: "Erreur",
        description: "Impossible de fusionner les conversations",
        variant: "destructive",
      });
    } finally {
      setMerging(false);
    }
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
              <Button onClick={() => navigate("/dashboard")}>
                Aller à la connexion WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <div className="flex-1 flex overflow-hidden">
            <div className="w-80 border-r flex flex-col">
              <div className="p-3 border-b">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMergeConversations}
                  disabled={merging || loadingConv}
                  className="w-full"
                >
                  {merging ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fusion en cours...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Nettoyer et fusionner
                    </>
                  )}
                </Button>
              </div>
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
            <div className="flex-1 flex flex-col">
              {selectedConversation ? (
                <>
                  <MessageThread
                    messages={messages}
                    contactPhone={selectedConversation.contact_phone}
                    contactName={selectedConversation.contact_name}
                  />
                  <MessageInput
                    onSend={(msg) => sendMessage(selectedConversationId!, msg)}
                  />
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
