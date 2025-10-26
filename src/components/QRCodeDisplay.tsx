import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QRCodeDisplayProps {
  qrCode: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const QRCodeDisplay = ({ qrCode, onRefresh, isRefreshing = false }: QRCodeDisplayProps) => {
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
        <div className="bg-white p-4 rounded-lg shadow-inner">
          <img
            src={qrCode}
            alt="QR Code WhatsApp"
            className="w-64 h-64"
          />
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

        <Button onClick={onRefresh} variant="outline" className="w-full" disabled={isRefreshing}>
          {isRefreshing ? 'Rafraîchissement...' : 'Rafraîchir le QR Code'}
        </Button>
      </CardContent>
    </Card>
  );
};
