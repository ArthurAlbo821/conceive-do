import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvolutionInstance } from '@/hooks/useEvolutionInstance';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Loader2 } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { instance, loading, error, createInstance, checkStatus } = useEvolutionInstance();

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
      createInstance();
    }
  }, [loading, instance, error]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading && !instance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {!instance ? 'Création de votre instance WhatsApp...' : 'Chargement...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Dashboard WhatsApp</h1>
          <Button variant="outline" onClick={handleLogout}>
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <Card className="mb-6 border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Erreur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => createInstance()} variant="outline">
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
              <CardContent>
                <ConnectionStatus
                  status={instance.instance_status}
                  phoneNumber={instance.phone_number}
                />
              </CardContent>
            </Card>

            {instance.instance_status === 'connecting' && instance.qr_code && (
              <QRCodeDisplay
                qrCode={instance.qr_code}
                onRefresh={() => createInstance()}
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
                </CardContent>
              </Card>
            )}

            {instance.instance_status === 'disconnected' && (
              <Card className="border-orange-500">
                <CardHeader>
                  <CardTitle className="text-orange-600">WhatsApp Déconnecté</CardTitle>
                  <CardDescription>
                    Votre WhatsApp s'est déconnecté. Reconnectez-vous en scannant un nouveau QR code.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => createInstance()}>
                    Reconnecter
                  </Button>
                </CardContent>
              </Card>
            )}

            {instance.instance_status === 'connecting' && !instance.qr_code && (
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
      </main>
    </div>
  );
};

export default Dashboard;
