import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface QRCodeDisplayProps {
  qrCode: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastQrUpdate?: string | null;
}

export const QRCodeDisplay = ({ qrCode, onRefresh, isRefreshing = false, lastQrUpdate }: QRCodeDisplayProps) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const QR_EXPIRATION_SECONDS = 120; // 2 minutes

  useEffect(() => {
    if (!lastQrUpdate) return;

    const updateElapsed = () => {
      const lastUpdate = new Date(lastQrUpdate).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - lastUpdate) / 1000);
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [lastQrUpdate]);

  const isExpired = elapsedSeconds > QR_EXPIRATION_SECONDS;
  const remainingSeconds = Math.max(0, QR_EXPIRATION_SECONDS - elapsedSeconds);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          Connectez votre WhatsApp
        </CardTitle>
        <CardDescription className="text-center">
          Scannez le QR code pour connecter votre numéro
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        <div className="relative">
          <div className={`bg-white p-4 rounded-lg shadow-inner transition-opacity ${isExpired ? 'opacity-50' : ''}`}>
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              className="w-64 h-64"
            />
          </div>
          
          {isExpired && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/90 rounded-lg">
              <div className="text-center text-destructive-foreground space-y-2 p-4">
                <AlertCircle className="w-12 h-12 mx-auto" />
                <p className="font-bold text-lg">QR Code expiré</p>
                <p className="text-sm">Cliquez sur "Rafraîchir" ci-dessous</p>
              </div>
            </div>
          )}

          {!isExpired && lastQrUpdate && (
            <Badge variant="secondary" className="absolute top-2 right-2 gap-1">
              <Clock className="w-3 h-3" />
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Badge>
          )}
        </div>

        {isExpired && (
          <div className="w-full p-3 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              Les QR codes WhatsApp expirent après 2 minutes pour votre sécurité. 
              Veuillez générer un nouveau QR code pour continuer.
            </p>
          </div>
        )}

        <div className="text-sm text-muted-foreground space-y-2 text-center">
          <p className="font-semibold">Instructions :</p>
          <ol className="text-left space-y-1 list-decimal list-inside">
            <li>Ouvrez WhatsApp sur votre téléphone</li>
            <li>Allez dans Paramètres → Appareils connectés</li>
            <li>Appuyez sur "Connecter un appareil"</li>
            <li>Scannez ce QR code</li>
          </ol>
        </div>

        <Button 
          onClick={onRefresh} 
          variant={isExpired ? "destructive" : "outline"} 
          className="w-full" 
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Rafraîchissement...' : isExpired ? '🔄 Générer un nouveau QR Code' : 'Rafraîchir le QR Code'}
        </Button>
      </CardContent>
    </Card>
  );
};
