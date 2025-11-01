import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const isConfirmed = understood && confirmText === "SUPPRIMER";

  const handleDelete = async () => {
    if (!isConfirmed) return;

    setIsDeleting(true);

    try {
      console.log("[DeleteAccountDialog] Starting account deletion...");

      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté pour supprimer votre compte",
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }

      // Call delete-account Edge Function
      const response = await supabase.functions.invoke("delete-account", {
        body: { userId: session.user.id },
      });

      if (response.error) {
        console.error("[DeleteAccountDialog] Error from Edge Function:", response.error);
        throw new Error(response.error.message || "Erreur lors de la suppression");
      }

      console.log("[DeleteAccountDialog] Account deleted successfully:", response.data);

      // Sign out the user
      await supabase.auth.signOut();

      // Clear local storage
      localStorage.clear();

      // Show success message
      toast({
        title: "Compte supprimé",
        description: "Votre compte et toutes vos données ont été supprimés définitivement.",
      });

      // Close dialog
      onOpenChange(false);

      // Redirect to auth page
      navigate("/auth");
    } catch (error) {
      console.error("[DeleteAccountDialog] Error deleting account:", error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la suppression de votre compte",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isDeleting) {
      setUnderstood(false);
      setConfirmText("");
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <span className="text-2xl">⚠️</span>
            Supprimer définitivement votre compte
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 pt-4">
            <p className="font-semibold text-foreground">
              Cette action est irréversible et supprimera :
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Votre instance WhatsApp</li>
              <li>Tous vos messages et conversations</li>
              <li>Tous vos rendez-vous</li>
              <li>Toutes vos disponibilités</li>
              <li>Toutes vos informations personnelles</li>
              <li>Votre compte utilisateur</li>
            </ul>

            <div className="flex items-start space-x-2 pt-4">
              <Checkbox
                id="understand"
                checked={understood}
                onCheckedChange={(checked) => setUnderstood(checked as boolean)}
                disabled={isDeleting}
              />
              <Label
                htmlFor="understand"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Je comprends que cette action est irréversible
              </Label>
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="confirm" className="text-sm font-medium">
                Tapez <span className="font-bold text-red-600">SUPPRIMER</span> pour confirmer :
              </Label>
              <Input
                id="confirm"
                type="text"
                placeholder="SUPPRIMER"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={!understood || isDeleting}
                className="font-mono"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Suppression...
              </>
            ) : (
              "Supprimer définitivement"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
