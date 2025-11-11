// src/pages/superadmin/Users.tsx
// Superadmin user management table with quick actions for account control.
// The goal is to keep the layout straightforward so more actions can be added later.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";
import {
  deleteUserPermanently,
  fetchSuperadminUsers,
  resetUserInstance,
  toggleUserActive,
  type SuperadminUserRow,
} from "@/integrations/supabase/superadmin";

const useDebouncedValue = (value: string, delay = 400) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
};

const UsersPage = () => {
  const [search, setSearch] = useState("");
  const [detailsUser, setDetailsUser] = useState<SuperadminUserRow | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const { toast } = useToast();

  const {
    data: users,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["superadmin", "users", debouncedSearch],
    queryFn: () => fetchSuperadminUsers(debouncedSearch),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      toggleUserActive(userId, isActive),
    onSuccess: () => {
      refetch();
      toast({ title: "Statut mis à jour" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserInstance(userId),
    onSuccess: () => {
      refetch();
      toast({ title: "Instance réinitialisée" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUserPermanently(userId),
    onSuccess: () => {
      setDetailsUser(null);
      refetch();
      toast({ title: "Utilisateur supprimé" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const isProcessing = useMemo(
    () => toggleMutation.isPending || resetMutation.isPending || deleteMutation.isPending,
    [toggleMutation.isPending, resetMutation.isPending, deleteMutation.isPending]
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Utilisateurs</h1>
                <p className="text-sm text-muted-foreground">
                  Gérez les comptes, les statuts et leurs accès WhatsApp.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link to="/superadmin">Retour au dashboard</Link>
              </Button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par email"
                className="max-w-sm"
              />
              <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
                {isFetching ? "Actualisation..." : "Rafraîchir"}
              </Button>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Instance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        Chargement des utilisateurs...
                      </TableCell>
                    </TableRow>
                  ) : users && users.length > 0 ? (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.full_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "superadmin" ? "default" : "secondary"}>{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "destructive"}>
                            {user.is_active ? "Actif" : "Désactivé"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.instance ? (
                            <div className="flex flex-col text-xs">
                              <span className="font-medium">{user.instance.instance_status}</span>
                              {user.instance.phone_number && <span>{user.instance.phone_number}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Aucune</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => setDetailsUser(user)}>
                            Détails
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate({ userId: user.id, isActive: !user.is_active })}
                          >
                            {user.is_active ? "Désactiver" : "Activer"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resetMutation.isPending}
                            onClick={() => resetMutation.mutate(user.id)}
                          >
                            Reset instance
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(user.id)}
                          >
                            Supprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        Aucun utilisateur trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </main>
        </div>
      </div>

      <Dialog open={!!detailsUser} onOpenChange={() => !isProcessing && setDetailsUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails utilisateur</DialogTitle>
            <DialogDescription>
              Vue rapide sur les informations et l'état du compte.
            </DialogDescription>
          </DialogHeader>
          {detailsUser && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email :</span> {detailsUser.email}
              </div>
              <div>
                <span className="text-muted-foreground">Nom :</span> {detailsUser.full_name || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Rôle :</span> {detailsUser.role}
              </div>
              <div>
                <span className="text-muted-foreground">Statut :</span> {detailsUser.is_active ? "Actif" : "Désactivé"}
              </div>
              <div>
                <span className="text-muted-foreground">Téléphone notification :</span>{" "}
                {detailsUser.informations?.notification_phone || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Adresse :</span> {detailsUser.informations?.adresse || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Instance :</span>{" "}
                {detailsUser.instance ? detailsUser.instance.instance_status : "Aucune"}
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setDetailsUser(null)}
              disabled={isProcessing}
            >
              Fermer
            </Button>
            {detailsUser && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggleMutation.isPending}
                  onClick={() =>
                    toggleMutation.mutate({
                      userId: detailsUser.id,
                      isActive: !detailsUser.is_active,
                    })
                  }
                >
                  {detailsUser.is_active ? "Désactiver" : "Activer"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetMutation.isPending}
                  onClick={() => detailsUser && resetMutation.mutate(detailsUser.id)}
                >
                  Reset instance
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => detailsUser && deleteMutation.mutate(detailsUser.id)}
                >
                  Supprimer définitivement
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default UsersPage;
