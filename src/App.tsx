import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Messages from "./pages/Messages";
import Informations from "./pages/Informations";
import Appointments from "./pages/Appointments";
import NotFound from "./pages/NotFound";
import SuperadminDashboard from "./pages/superadmin/Dashboard";
import SuperadminUsers from "./pages/superadmin/Users";
import SuperadminInstances from "./pages/superadmin/Instances";
import { SuperadminRoute } from "./components/SuperadminRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/informations" element={<Informations />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route
            path="/superadmin"
            element={
              <SuperadminRoute>
                <SuperadminDashboard />
              </SuperadminRoute>
            }
          />
          <Route
            path="/superadmin/users"
            element={
              <SuperadminRoute>
                <SuperadminUsers />
              </SuperadminRoute>
            }
          />
          <Route
            path="/superadmin/instances"
            element={
              <SuperadminRoute>
                <SuperadminInstances />
              </SuperadminRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
