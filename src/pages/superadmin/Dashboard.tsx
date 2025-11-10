// src/pages/superadmin/Dashboard.tsx
// Superadmin dashboard summarising key metrics for the platform health.
// The page focuses on essentials so we can extend it gradually without heavy refactors.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";
import { useSuperadminStats } from "@/hooks/useSuperadminStats";
import type { SystemErrorEntry } from "@/integrations/supabase/superadmin";

const MetricSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-24" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-6 w-16" />
    </CardContent>
  </Card>
);

const formatTimestamp = (entry: SystemErrorEntry) => {
  try {
    if (!entry.created_at) return "Date inconnue";
    return new Date(entry.created_at).toLocaleString();
  } catch (error) {
    return entry.created_at ?? "Date inconnue";
  }
};

const SuperadminDashboard = () => {
  const { data, isLoading, refetch, isFetching } = useSuperadminStats();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <main className="flex-1 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">SuperAdmin</h1>
                <p className="text-sm text-muted-foreground">
                  Vue d'ensemble des métriques clés de la plateforme.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="secondary">
                  <Link to="/superadmin/users">Gérer les utilisateurs</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/superadmin/instances">Monitorer les instances</Link>
                </Button>
                <Button onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? "Actualisation..." : "Actualiser"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isLoading || !data ? (
                Array.from({ length: 6 }).map((_, index) => <MetricSkeleton key={index} />)
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Utilisateurs totaux</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">{data.totalUsers}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Instances connectées</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">
                        {data.connectedInstances} / {data.totalInstances}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Messages (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">{data.messagesLast24h}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Réponses IA (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">{data.aiAutoRepliesLast24h}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Rendez-vous aujourd'hui</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-semibold">{data.appointmentsToday}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Erreurs système récentes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {data.recentErrors.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aucune erreur récente.</p>
                      )}
                      {data.recentErrors.map((entry) => (
                        <div key={entry.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                          <p className="text-sm font-medium">{entry.status ?? "Erreur"}</p>
                          {entry.error_message && (
                            <p className="text-xs text-muted-foreground">{entry.error_message}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{formatTimestamp(entry)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SuperadminDashboard;
