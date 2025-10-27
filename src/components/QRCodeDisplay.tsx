import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface QRCodeDisplayProps {
  qrCode: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastQrUpdate?: string | null;
}

export const QRCodeDisplay = ({ qrCode, onRefresh, isRefreshing = false, lastQrUpdate }: QRCodeDisplayProps) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const QR_EXPIRATION_SECONDS = 120; // 2 minutes
  const autoRefreshFiredRef = useRef(false);

  // Reset auto-refresh flag when QR updates
  useEffect(() => {
    autoRefreshFiredRef.current = false;
  }, [lastQrUpdate]);

  useEffect(() => {
    if (!lastQrUpdate) return;

    // Reset timer when QR is refreshed
    setElapsedSeconds(0);

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

  const remainingSeconds = Math.max(0, QR_EXPIRATION_SECONDS - elapsedSeconds);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  // Auto-refresh when timer reaches 0
  useEffect(() => {
    if (!lastQrUpdate) return;
    if (remainingSeconds === 0 && !isRefreshing && !autoRefreshFiredRef.current) {
      autoRefreshFiredRef.current = true;
      onRefresh();
    }
  }, [remainingSeconds, lastQrUpdate, isRefreshing, onRefresh]);

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
          {lastQrUpdate && (
            <Badge variant="secondary" className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 gap-1">
              <Clock className="w-3 h-3" />
              {minutes}:{seconds.toString().padStart(2, '0')}
            </Badge>
          )}
          <div className="bg-white p-4 rounded-lg shadow-inner">
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              className="w-64 h-64"
            />
          </div>
        </div>

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
          variant="outline" 
          className="w-full" 
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Rafraîchissement...' : 'Rafraîchir le QR Code'}
        </Button>
      </CardContent>
    </Card>
  );
};
