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
  const QR_EXPIRATION_SECONDS = 60; // 1 minute

  // Gestion d'un cycle local pour redémarrer visuellement le timer à 2:00 dès qu'on atteint 0:00
  const autoRefreshFiredRef = useRef(false);
  const localCycleStartRef = useRef<number | null>(null);
  const lastQrRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);

  // Synchroniser la dernière date connue et réinitialiser les états liés aux retries
  useEffect(() => {
    lastQrRef.current = lastQrUpdate || null;
    autoRefreshFiredRef.current = false;
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    localCycleStartRef.current = null;
  }, [lastQrUpdate]);

  useEffect(() => {
    if (!lastQrUpdate) return;

    // Reset du compteur quand le QR est rafraîchi côté backend
    setElapsedSeconds(0);

    const updateElapsed = () => {
      const base = localCycleStartRef.current ?? new Date(lastQrUpdate).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - base) / 1000);
      setElapsedSeconds(Math.max(0, elapsed));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [lastQrUpdate]);

  const remainingSeconds = Math.max(0, QR_EXPIRATION_SECONDS - elapsedSeconds);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  // Auto-refresh lorsque le timer atteint 0, avec redémarrage visuel immédiat et petits retries silencieux
  useEffect(() => {
    if (!lastQrUpdate) return;
    if (remainingSeconds === 0 && !isRefreshing && !autoRefreshFiredRef.current) {
      autoRefreshFiredRef.current = true;

      // Redémarrer visuellement à 2:00 sans attendre la propagation côté backend
      localCycleStartRef.current = Date.now();

      // Mémorise la dernière valeur connue pour détecter un changement de lastQrUpdate
      const previous = lastQrRef.current;
      retryCountRef.current = 0;

      const scheduleRetry = () => {
        // Si lastQrUpdate a changé entre-temps, on arrête les retries
        if (lastQrRef.current !== previous) return;
        if (retryCountRef.current >= 3) return;
        retryCountRef.current += 1;
        onRefresh();
        retryTimeoutRef.current = window.setTimeout(scheduleRetry, 5000);
      };

      onRefresh();
      retryTimeoutRef.current = window.setTimeout(scheduleRetry, 5000);
    }
  }, [remainingSeconds, lastQrUpdate, isRefreshing, onRefresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

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
            <Badge variant="secondary" className="absolute -top-6 left-1/2 -translate-x-1/2 z-10 gap-1">
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
