import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// Format phone number for display
function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  // Remove any WhatsApp-specific suffixes
  const cleaned = phone.split("@")[0];

  // Only display if it looks like a valid E.164 number
  if (/^\+?\d{7,15}$/.test(cleaned)) {
    // Add + prefix if not present
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  }

  // For LID identifiers or invalid formats, return empty
  return "";
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
    <ScrollArea className="flex-1">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelectConversation(conv.id)}
          className={`w-full p-4 text-left hover:bg-muted transition-colors border-b ${
            selectedConversationId === conv.id ? "bg-muted" : ""
          }`}
        >
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">
                {conv.contact_name || formatPhoneNumber(conv.contact_phone) || "Contact"}
              </div>
              {conv.contact_name && formatPhoneNumber(conv.contact_phone) && (
                <div className="text-xs text-muted-foreground truncate">
                  {formatPhoneNumber(conv.contact_phone)}
                </div>
              )}
            </div>
            {conv.unread_count > 0 && (
              <Badge variant="default" className="ml-2 flex-shrink-0">
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
        <div className="p-8 text-center text-muted-foreground">Aucune conversation</div>
      )}
    </ScrollArea>
  );
}
