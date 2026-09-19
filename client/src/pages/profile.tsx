import { useState } from "react";
import { KeyRound, Save, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { Field } from "@/components/form";
import { useAuth } from "@/features/auth/auth-context";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/lib/crud";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  const saveName = useMutation({
    mutationFn: () => authApi.updateMe(name),
    onSuccess: (u) => {
      updateUser(u);
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const savePassword = useMutation({
    mutationFn: () => authApi.changePassword(pw.current, pw.next),
    onSuccess: () => {
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed. Other devices have been signed out.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function submitPassword() {
    const e: Record<string, string> = {};
    if (!pw.current) e.current = "Current password is required";
    if (pw.next.length < 8) e.next = "Must be at least 8 characters";
    else if (!/[a-z]/.test(pw.next)) e.next = "Must contain a lowercase letter";
    else if (!/[A-Z]/.test(pw.next)) e.next = "Must contain an uppercase letter";
    else if (!/[0-9]/.test(pw.next)) e.next = "Must contain a number";
    if (pw.next !== pw.confirm) e.confirm = "Passwords do not match";
    setPwErrors(e);
    if (Object.keys(e).length === 0) savePassword.mutate();
  }

  if (!user) return null;

  return (
    <AppLayout title="My Profile">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Account summary */}
        <Card>
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge tone="primary" className="mt-1.5 capitalize">
                <ShieldCheck className="mr-1 size-3" />
                {user.role}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Name */}
        <Card>
          <CardHeader
            title="Display name"
            description="This is how your name appears across the system."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input
                value={name.firstName}
                onChange={(e) => setName({ ...name, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last name">
              <Input
                value={name.lastName}
                onChange={(e) => setName({ ...name, lastName: e.target.value })}
              />
            </Field>
          </div>
          <Button
            onClick={() => saveName.mutate()}
            isLoading={saveName.isPending}
            disabled={!name.firstName.trim() || !name.lastName.trim()}
          >
            <Save className="size-4" /> Save name
          </Button>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader
            title="Change password"
            description="Changing your password signs out all other devices."
          />
          <Field label="Current password" required error={pwErrors.current}>
            <Input
              type="password"
              autoComplete="current-password"
              value={pw.current}
              error={!!pwErrors.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" required error={pwErrors.next}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pw.next}
                error={!!pwErrors.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password" required error={pwErrors.confirm}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                error={!!pwErrors.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Must be at least 8 characters and include an uppercase letter, a lowercase letter and a
            number.
          </p>
          <Button
            onClick={submitPassword}
            isLoading={savePassword.isPending}
            disabled={!pw.current || !pw.next || !pw.confirm}
          >
            <KeyRound className="size-4" /> Change password
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}
