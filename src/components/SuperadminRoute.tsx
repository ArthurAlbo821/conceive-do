// src/components/SuperadminRoute.tsx
// Wraps protected routes so only superadmins can see administrative pages.
// The guard stays minimal on purpose: it redirects non-superadmins back to the dashboard.

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

interface SuperadminRouteProps {
  children: ReactNode;
}

export const SuperadminRoute = ({ children }: SuperadminRouteProps) => {
  const { profile, isLoading } = useCurrentProfile();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile || profile.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
