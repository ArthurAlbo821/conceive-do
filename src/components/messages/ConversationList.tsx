import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// Format phone number for display
function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Remove any remaining @ suffixes
  const cleaned = phone.split('@')[0];
  // Add + prefix if not present
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

interface Conversation {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: ConversationListProps) {
  return (
    <div className="h-full border-r">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Conversations</h2>
      </div>
      <ScrollArea className="h-[calc(100vh-8rem)]">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={`w-full p-4 text-left hover:bg-muted transition-colors border-b ${
              selectedConversationId === conv.id ? "bg-muted" : ""
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-semibold">
                {conv.contact_name || formatPhoneNumber(conv.contact_phone)}
              </span>
              {conv.unread_count > 0 && (
                <Badge variant="default" className="ml-2">
                  {conv.unread_count}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {conv.last_message_text || "Aucun message"}
            </p>
            {conv.last_message_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(conv.last_message_at), {
                  addSuffix: true,
                  locale: fr,
                })}
              </p>
            )}
          </button>
        ))}
        {conversations.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            Aucune conversation
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
