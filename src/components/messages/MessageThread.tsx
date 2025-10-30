import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Message {
  id: string;
  content: string;
  direction: "incoming" | "outgoing";
  timestamp: string;
  status: string;
}

interface MessageThreadProps {
  messages: Message[];
  contactPhone: string;
  contactName: string | null;
  conversationId: string;
  aiEnabled: boolean;
  onToggleAI: (enabled: boolean) => void;
}

export function MessageThread({
  messages,
  contactPhone,
  contactName,
  conversationId: _conversationId,
  aiEnabled,
  onToggleAI,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Reset initial load flag when conversation changes
  useEffect(() => {
    setIsInitialLoad(true);
  }, [contactPhone]);

  // Intelligent scroll: only auto-scroll if user is near bottom or initial load
  useEffect(() => {
    if (!scrollRef.current) return;

    const scrollElement = scrollRef.current;
    const isNearBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;

    // Auto-scroll only if at bottom or initial load
    if (isInitialLoad || isNearBottom) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }

    setIsInitialLoad(false);
  }, [messages, isInitialLoad]);

  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
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
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">
            {contactName || formatPhoneNumber(contactPhone) || "Contact"}
          </h2>
          {contactName && formatPhoneNumber(contactPhone) && (
            <p className="text-sm text-muted-foreground">{formatPhoneNumber(contactPhone)}</p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Label htmlFor="ai-toggle" className="text-sm">
            IA
          </Label>
          <Switch id="ai-toggle" checked={aiEnabled} onCheckedChange={onToggleAI} />
        </div>
      </div>
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === "outgoing" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  msg.direction === "outgoing" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <p className="break-words">{msg.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.direction === "outgoing"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatDistanceToNow(new Date(msg.timestamp), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
