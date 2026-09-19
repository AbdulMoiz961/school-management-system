import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Users,
  School,
  BookOpen,
  CalendarCheck,
  Banknote,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardHeader, Badge, Spinner } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import { dashboardApi } from "@/api/phase6";

export default function DashboardPage() {
  const { user } = useAuth();

  const stats = useQuery({
    queryKey: ["dashboard", user?.role],
    queryFn: () => dashboardApi.get(),
  });

  const data = stats.data;

  const cards = data
    ? [
        { label: "Students", value: String(data.counts.students), icon: GraduationCap, tone: "primary" as const },
        { label: "Teachers", value: String(data.counts.teachers), icon: Users, tone: "success" as const },
        { label: "Classes", value: String(data.counts.classes), icon: School, tone: "warning" as const },
        { label: "Subjects", value: String(data.counts.subjects), icon: BookOpen, tone: "primary" as const },
      ]
    : [];

  return (
    <AppLayout title="Dashboard">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Welcome back, {user?.firstName} 👋
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A live overview of your school, scoped to your role.
          </p>
        </div>

        {stats.isLoading && (
          <div className="flex items-center gap-3 py-16 text-sm text-muted-foreground">
            <Spinner /> Loading dashboard…
          </div>
        )}

        {stats.isError && (
          <Card>
            <p className="text-sm text-destructive">Could not load the dashboard.</p>
          </Card>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => (
                <Card key={c.label}>
                  <div className="flex items-center gap-4">
                    <div className="grid size-11 place-items-center rounded-lg bg-secondary">
                      <c.icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        {c.label}
                      </p>
                      <p className="font-display text-2xl font-semibold text-foreground">
                        {c.value}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Secondary metrics */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader
                  title="Attendance"
                  description="Average across recorded sessions"
                />
                <div className="flex items-center gap-2">
                  <CalendarCheck className="size-5 text-success" />
                  <span className="font-display text-3xl font-semibold text-foreground">
                    {data.attendance.average}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.attendance.todayMarked} register(s) marked today
                </p>
              </Card>

              <Card>
                <CardHeader title="Fees" description="Collected vs outstanding" />
                <div className="flex items-center gap-2">
                  <Banknote className="size-5 text-success" />
                  <span className="font-display text-3xl font-semibold text-foreground">
                    {data.fees.collected.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.fees.outstanding.toLocaleString()} outstanding · {data.fees.unpaidInvoices}{" "}
                  unpaid invoice(s)
                </p>
              </Card>

              <Card>
                <CardHeader title="At-risk students" description="Below thresholds" />
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />
                  <span className="font-display text-3xl font-semibold text-foreground">
                    {data.atRisk.length}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  attendance &lt;75% or grade &lt;50%
                </p>
              </Card>
            </div>

            {/* At-risk list */}
            {data.atRisk.length > 0 && (
              <Card className="p-0">
                <div className="border-b border-border px-5 py-4">
                  <CardHeader
                    title="Students needing attention"
                    description="Flagged for low attendance or grades"
                  />
                </div>
                <ul className="divide-y divide-border">
                  {data.atRisk.map((s) => (
                    <li key={s.studentId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{s.rollNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {s.name}
                      </span>
                      {s.classSectionName && (
                        <Badge tone="default">{s.classSectionName}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {s.reasons.join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Recent activity */}
            <Card className="p-0">
              <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                <Activity className="size-4 text-muted-foreground" />
                <CardHeader title="Recent activity" description="Latest changes across the system" />
              </div>
              <ul className="divide-y divide-border">
                {data.recentActivity.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <Badge tone="default">{a.action}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {a.resourceLabel ?? a.resource}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
                {data.recentActivity.length === 0 && (
                  <li className="px-5 py-6 text-sm text-muted-foreground">No activity yet.</li>
                )}
              </ul>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
