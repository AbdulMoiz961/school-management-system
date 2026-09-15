import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Users,
  School,
  BookOpen,
  CalendarCheck,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardHeader, Badge, Spinner, Alert } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/api/client";

interface SystemStatus {
  database: { state: string; name: string | null; host: string | null };
  roles: string[];
  timestamp: string;
}

/** Placeholder stats until Phase 3 wires real aggregates. */
const STATS = [
  { label: "Students", value: "—", icon: GraduationCap, tone: "primary" as const },
  { label: "Teachers", value: "—", icon: Users, tone: "success" as const },
  { label: "Classes", value: "—", icon: School, tone: "warning" as const },
  { label: "Subjects", value: "—", icon: BookOpen, tone: "primary" as const },
];

export default function DashboardPage() {
  const { user } = useAuth();

  // Proves the authenticated API path works end-to-end from the client.
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.get<SystemStatus>("/system/status"),
    refetchInterval: 30_000,
  });

  return (
    <AppLayout title="Dashboard">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Greeting */}
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Welcome back, {user?.firstName} 👋
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's an overview of your school. Modules populate as each phase is built.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map(({ label, value, icon: Icon, tone }) => (
            <Card key={label}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p>
                </div>
                <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                <Badge tone={tone}>Phase 3</Badge>
              </p>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* System health — real data */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="System status"
              description="Live check between the client, API and database."
            />
            {status.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Checking…
              </div>
            )}
            {status.isError && (
              <Alert tone="danger">Could not reach the API. Is the server running?</Alert>
            )}
            {status.data && (
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">API</dt>
                  <dd className="mt-1">
                    <Badge tone="success">connected</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Database</dt>
                  <dd className="mt-1">
                    <Badge tone={status.data.database.state === "connected" ? "success" : "warning"}>
                      {status.data.database.state}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Host</dt>
                  <dd className="mt-1 truncate text-sm text-foreground">
                    {status.data.database.host ?? "—"}
                  </dd>
                </div>
              </dl>
            )}
          </Card>

          {/* Roadmap */}
          <Card>
            <CardHeader title="Build progress" description="What's live so far." />
            <ul className="space-y-3 text-sm">
              {[
                { label: "Monorepo + tooling", done: true },
                { label: "Auth & role-based access", done: true },
                { label: "Core CRUD modules", done: false },
                { label: "Attendance & timetable", done: false },
                { label: "Assignments, exams, grades", done: false },
                { label: "Fees, analytics, audit log", done: false },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3">
                  <span
                    className={
                      item.done
                        ? "grid size-5 shrink-0 place-items-center rounded-full bg-success/20 text-success"
                        : "grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
                    }
                  >
                    {item.done ? "✓" : "·"}
                  </span>
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Placeholder for charts */}
        <Card>
          <CardHeader
            title="Attendance overview"
            description="Trends will render here once attendance data exists."
            action={
              <Badge tone="primary">
                <TrendingUp className="mr-1 size-3" /> Phase 4
              </Badge>
            }
          />
          <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              <CalendarCheck className="mx-auto mb-2 size-5" />
              No attendance data yet
            </p>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
