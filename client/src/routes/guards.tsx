import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "@sms/shared";
import { useAuth } from "@/features/auth/auth-context";
import { Spinner } from "@/components/ui";

/** Full-page loader shown while the initial session restore is in flight. */
function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-7" />
        <p className="text-sm text-muted-foreground">Restoring your session…</p>
      </div>
    </div>
  );
}

/** Requires an authenticated user. Redirects to /login preserving the target. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isBooting } = useAuth();
  const location = useLocation();

  if (isBooting) return <BootScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

/** Requires one of the given roles AND authentication. */
export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isAuthenticated, isBooting } = useAuth();

  if (isBooting) return <BootScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !roles.includes(user.role)) {
    // Authenticated but not permitted — show a clear denial, not a redirect loop.
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This area requires the{" "}
            <span className="font-medium text-foreground">{roles.join(" or ")}</span> role.
            You are signed in as <span className="font-medium text-foreground">{user?.role}</span>.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Redirects an already-authenticated user away from /login and /register. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isBooting } = useAuth();
  if (isBooting) return <BootScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
