import { Badge } from "@/components/ui/badge";

interface ConnectionStatusProps {
  status: "creating" | "disconnected" | "connecting" | "connected" | "error";
  phoneNumber?: string | null;
}

export const ConnectionStatus = ({ status, phoneNumber }: ConnectionStatusProps) => {
  const statusConfig = {
    creating: {
      variant: "secondary" as const,
      text: "Création...",
      icon: "⏳",
      className: "bg-secondary text-secondary-foreground",
    },
    disconnected: {
      variant: "secondary" as const,
      text: "Déconnecté",
      icon: "⚠️",
      className: "bg-orange-500 text-white",
    },
    connecting: {
      variant: "secondary" as const,
      text: "Connexion...",
      icon: "🔄",
      className: "bg-yellow-500 text-white",
    },
    connected: {
      variant: "default" as const,
      text: "Connecté",
      icon: "✓",
      className: "bg-green-500 text-white",
    },
    error: {
      variant: "destructive" as const,
      text: "Erreur",
      icon: "✗",
      className: "bg-destructive text-destructive-foreground",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-3">
      <Badge variant={config.variant} className={config.className}>
        <span className="mr-1">{config.icon}</span>
        {config.text}
      </Badge>
      {status === "connected" && phoneNumber && (
        <span className="text-sm text-muted-foreground">+{phoneNumber}</span>
      )}
    </div>
  );
};
