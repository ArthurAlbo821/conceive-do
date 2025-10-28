import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvolutionInstance } from '@/hooks/useEvolutionInstance';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Loader2, Trash2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Navbar } from '@/components/Navbar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const Dashboard = () => {
  const navigate = useNavigate();
  const { instance, loading, error, createInstance, checkStatus } = useEvolutionInstance();
  const { toast } = useToast();
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    // If no instance exists, create one automatically
    if (!loading && !instance && !error) {
      createInstance({ forceRefresh: false });
    }
  }, [loading, instance, error]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleCleanupOldInstances = async () => {
    setIsCleaningUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-old-instances');
      
      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: "Nettoyage réussi",
          description: `${data.deleted} ancienne(s) instance(s) supprimée(s).`,
        });
      } else {
        throw new Error(data?.error || 'Erreur inconnue');
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      toast({
        title: "Erreur de nettoyage",
        description: error instanceof Error ? error.message : "Impossible de nettoyer les anciennes instances.",
        variant: "destructive",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleResetInstance = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir réinitialiser votre instance ? Un nouveau QR code sera généré.')) {
      return;
    }
    
    setIsResetting(true);
    try {
      // Call edge function to properly delete from Evolution API and DB
      const { data, error } = await supabase.functions.invoke('reset-current-instance');
      
      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Erreur lors de la suppression');
      }
      
      toast({
        title: 'Instance supprimée',
        description: 'Création d\'une nouvelle instance en cours...',
      });
      
      // Small delay to let the DB update propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recreate instance with proper webhook configuration
      await createInstance({ forceRefresh: false });
      
    } catch (error) {
      console.error('Error resetting instance:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible de réinitialiser l\'instance',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleReconfigureWebhook = async () => {
    try {
      toast({
        title: 'Reconfiguration du webhook',
        description: 'Configuration en cours...',
      });

      const { data, error } = await supabase.functions.invoke('set-webhook');
      
      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Erreur lors de la reconfiguration');
      }
      
      toast({
        title: 'Webhook reconfiguré',
        description: 'Les messages devraient maintenant être reçus correctement.',
      });
      
    } catch (error) {
      console.error('Error reconfiguring webhook:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible de reconfigurer le webhook',
        variant: 'destructive',
      });
    }
  };

  const handleToggleAI = async (enabled: boolean) => {
    if (!instance?.id) return;
    
    try {
      const { error } = await supabase
        .from('evolution_instances')
        .update({ ai_enabled: enabled })
        .eq('id', instance.id);
        
      if (error) throw error;
      
      toast({
        title: enabled ? "IA activée" : "IA désactivée",
        description: enabled 
          ? "Les messages recevront des réponses automatiques"
          : "Les réponses automatiques sont désactivées"
      });
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de modifier le paramètre IA',
        variant: 'destructive',
      });
    }
  };

  if (loading && !instance) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {!instance ? 'Création de votre instance WhatsApp...' : 'Chargement...'}
              </p>
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
          
          <main className="flex-1 p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Connexion WhatsApp</h2>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleResetInstance}
                    disabled={isResetting || loading}
                    title="Réinitialiser l'instance (supprime et recrée)"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {isResetting ? 'Réinit...' : 'Réinitialiser'}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCleanupOldInstances}
                    disabled={isCleaningUp}
                    title="Nettoyer les anciennes instances"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isCleaningUp ? 'Nettoyage...' : 'Nettoyer'}
                  </Button>
                </div>
              </div>
              
              {/* Real-time monitoring indicator */}
              {instance && (
                <div className="flex items-center gap-2 mb-6">
                  {instance.instance_status === 'connected' && (
                    <>
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                          Détection automatique active
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Vérification toutes les 15s
                      </span>
                    </>
                  )}
                  {instance.instance_status === 'connecting' && (
                    <>
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                          Vérification périodique
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Vérification toutes les 5s
                      </span>
                    </>
                  )}
                </div>
              )}

              {error && (
                <Card className="mb-6 border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive">Erreur</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>
                    <Button onClick={() => createInstance({ forceRefresh: false })} variant="outline">
                      Réessayer
                    </Button>
                  </CardContent>
                </Card>
              )}

              {instance && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Statut de connexion</CardTitle>
                      <CardDescription>
                        État actuel de votre connexion WhatsApp
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ConnectionStatus
                        status={instance.instance_status}
                        phoneNumber={instance.phone_number}
                      />
                      <Button 
                        onClick={() => checkStatus()} 
                        variant="outline" 
                        size="sm"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Vérification...
                          </>
                        ) : (
                          '🔄 Vérifier le statut'
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {(instance.instance_status === 'connecting' || instance.instance_status === 'disconnected') && instance.qr_code && (
                    <QRCodeDisplay
                      qrCode={instance.qr_code}
                      onRefresh={() => createInstance({ forceRefresh: true, silent: true })}
                      isRefreshing={loading}
                      lastQrUpdate={instance.last_qr_update}
                    />
                  )}

                  {instance.instance_status === 'connected' && (
                    <Card className="border-green-500">
                      <CardHeader>
                        <CardTitle className="text-green-600">WhatsApp Connecté ✓</CardTitle>
                        <CardDescription>
                          Votre WhatsApp est prêt à recevoir des messages !
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <p className="text-sm">
                              <span className="font-semibold">Numéro connecté :</span>{' '}
                              +{instance.phone_number}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Votre instance WhatsApp est maintenant opérationnelle. Les messages seront
                              automatiquement traités.
                            </p>
                          </div>
                          
                          {/* AI Auto-Reply Toggle */}
                          <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-0.5">
                              <Label htmlFor="ai-toggle" className="text-base font-medium">
                                Réponses automatiques IA
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Répondre automatiquement aux messages avec OpenAI
                              </p>
                            </div>
                            <Switch
                              id="ai-toggle"
                              checked={instance?.ai_enabled || false}
                              onCheckedChange={handleToggleAI}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Button onClick={() => navigate('/messages')} className="w-full">
                              Accéder aux messages
                            </Button>
                            <Button 
                              onClick={handleReconfigureWebhook} 
                              variant="outline" 
                              className="w-full"
                            >
                              🔧 Reconfigurer le webhook
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {(instance.instance_status === 'connecting' || instance.instance_status === 'disconnected') && !instance.qr_code && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <p className="text-sm text-muted-foreground">
                            Génération du QR code en cours...
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
