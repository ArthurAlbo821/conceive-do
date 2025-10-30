import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">WhatsApp AI Assistant</h1>
        <p className="text-lg text-gray-600">
          Connectez votre WhatsApp et automatisez vos conversations
        </p>
        <Button onClick={() => navigate("/auth")} size="lg">
          Commencer
        </Button>
      </div>
    </div>
  );
};

export default Index;
