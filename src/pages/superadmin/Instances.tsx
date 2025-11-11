// src/pages/superadmin/Instances.tsx
// Superadmin monitoring table for WhatsApp instances with quick remediation actions.
// Each action intentionally stays simple so we can plug deeper workflows later if needed.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";
import {
  fetchInstanceLogs,
  fetchSuperadminInstances,
  refreshInstanceQr,
  resetUserInstance,
  type AiLogEntry,
  type SuperadminInstanceRow,
} from "@/integrations/supabase/superadmin";

const statusOptions = [
  { value: "all", label: "Tous" },
  { value: "connected", label: "Connecté" },
  { value: "connecting", label: "Connexion" },
  { value: "disconnected", label: "Déconnecté" },
  { value: "error", label: "Erreur" },
];

const InstancesPage = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logsUserId, setLogsUserId] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<SuperadminInstanceRow | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const {
    data: instances,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["superadmin", "instances", statusFilter],
    queryFn: () =>
      fetchSuperadminInstances(statusFilter === "all" ? undefined : statusFilter),
  });

  const logsQuery = useQuery({
    queryKey: ["superadmin", "instance-logs", logsUserId],
    queryFn: () => fetchInstanceLogs(logsUserId!),
    enabled: !!logsUserId,
  });

  const refreshMutation = useMutation({
    mutationFn: (instanceId: string) => refreshInstanceQr(instanceId),
    onSuccess: () => {
      refetch();
      toast({ title: "QR code rafraîchi" });
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

  const filteredInstances = (instances ?? []).filter((instance) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      instance.instance_name.toLowerCase().includes(query) ||
      instance.user?.email.toLowerCase().includes(query) ||
      (instance.user?.full_name?.toLowerCase().includes(query) ?? false)
    );
  });

  const openLogs = (instance: SuperadminInstanceRow) => {
    setSelectedInstance(instance);
    setLogsUserId(instance.user_id);
  };

  const closeLogs = () => {
    setLogsUserId(null);
    setSelectedInstance(null);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Instances WhatsApp</h1>
                <p className="text-sm text-muted-foreground">
                  Surveillez les connexions et intervenez rapidement si nécessaire.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link to="/superadmin">Retour au dashboard</Link>
              </Button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher par email ou instance"
                  className="w-64"
                />
              </div>
              <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
                {isFetching ? "Actualisation..." : "Rafraîchir"}
              </Button>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instance</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Dernière mise à jour</TableHead>
                    <TableHead>Dernier QR</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        Chargement des instances...
                      </TableCell>
                    </TableRow>
                  ) : filteredInstances.length > 0 ? (
                    filteredInstances.map((instance) => (
                      <TableRow key={instance.id}>
                        <TableCell>{instance.instance_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span className="font-medium">{instance.user?.email ?? "—"}</span>
                            {instance.user?.full_name && <span>{instance.user.full_name}</span>}
                          </div>
                        </TableCell>
                        <TableCell>{instance.instance_status}</TableCell>
                        <TableCell>
                          {instance.updated_at ? new Date(instance.updated_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell>
                          {instance.last_qr_update ? new Date(instance.last_qr_update).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={refreshMutation.isPending}
                            onClick={() => refreshMutation.mutate(instance.id)}
                          >
                            Rafraîchir QR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resetMutation.isPending}
                            onClick={() => resetMutation.mutate(instance.user_id)}
                          >
                            Reset
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openLogs(instance)}>
                            Logs
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        Aucune instance trouvée.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </main>
        </div>
      </div>

      <Dialog open={!!selectedInstance} onOpenChange={() => closeLogs()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Logs récents</DialogTitle>
            <DialogDescription>
              Historique rapide des événements pour diagnostiquer les problèmes.
            </DialogDescription>
          </DialogHeader>
          {selectedInstance && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Instance :</span> {selectedInstance.instance_name}
              </div>
              <div>
                <span className="text-muted-foreground">Utilisateur :</span> {selectedInstance.user?.email ?? "—"}
              </div>
            </div>
          )}
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {logsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Chargement des logs...</p>
            ) : logsQuery.data && logsQuery.data.length > 0 ? (
              logsQuery.data.map((log: AiLogEntry) => (
                <div key={log.id} className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                  <p className="text-sm font-medium">{log.event_type}</p>
                  {log.message && <p className="text-sm">{log.message}</p>}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucun log disponible.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeLogs}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default InstancesPage;
