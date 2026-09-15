import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/features/auth/auth-context";
import { Badge } from "./ui";

/** Authenticated application shell: fixed sidebar + header + scrollable content. */
export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {user && <Badge tone="primary" className="capitalize">{user.role}</Badge>}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
