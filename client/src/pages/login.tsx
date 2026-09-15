import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { Button, Input, Label, Alert, Card } from "@/components/ui";
import { ApiClientError } from "@/api/errors";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.fieldMessage);
      } else {
        setError("Could not reach the server. Is the API running?");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand panel (hidden on small screens) */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex">
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">Scholaris</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">
            One place for the whole school.
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Students, staff, timetables, attendance, assignments, exams and fees — managed from a
            single system with role-aware access for administrators, teachers and students.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {[
              { k: "Roles", v: "3" },
              { k: "Modules", v: "12" },
              { k: "Stack", v: "MERN" },
            ].map((s) => (
              <div key={s.k}>
                <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  {s.k}
                </p>
                <p className="mt-1 font-display text-lg text-foreground">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} Scholaris. A portfolio project by Abdul Moiz.
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="font-display text-base font-semibold">Scholaris</span>
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to your account to continue.
          </p>

          <Card className="mt-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {error && <Alert tone="danger">{error}</Alert>}

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full" isLoading={busy}>
                Sign in
              </Button>
            </form>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>

          <div className="mt-6 rounded-lg border border-border bg-card/50 p-3.5">
            <p className="text-xs font-medium text-foreground">Demo accounts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run <code className="rounded bg-secondary px-1 py-0.5">npm run seed</code> in the
              server to create admin, teacher and student logins.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
