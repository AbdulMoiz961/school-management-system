import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  Receipt,
  Megaphone,
  History,
  LogOut,
  School,
  UserCog,
  X,
  CalendarRange,
  IdCard,
} from "lucide-react";
import type { Role } from "@sms/shared";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles allowed to see this item. */
  roles: Role[];
  /** Optional label override per role, e.g. Students → "My Profile" for students. */
  labelByRole?: Partial<Record<Role, string>>;
}

/** Navigation is filtered by role — but this is UX only.
 *  Every endpoint re-checks permissions server-side. */
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "teacher", "student"] },
  {
    to: "/terms",
    label: "Academic Terms",
    icon: CalendarRange,
    roles: ["admin", "teacher", "student"],
  },
  { to: "/classes", label: "Classes", icon: School, roles: ["admin", "teacher"] },
  {
    to: "/students",
    label: "Students",
    icon: GraduationCap,
    roles: ["admin", "teacher", "student"],
    labelByRole: { student: "My Profile" },
  },
  { to: "/teachers", label: "Teachers", icon: Users, roles: ["admin"] },
  { to: "/subjects", label: "Subjects", icon: BookOpen, roles: ["admin", "teacher", "student"] },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck,
    roles: ["admin", "teacher", "student"],
  },
  {
    to: "/timetable",
    label: "Timetable",
    icon: CalendarClock,
    roles: ["admin", "teacher", "student"],
  },
  {
    to: "/assignments",
    label: "Assignments",
    icon: ClipboardList,
    roles: ["admin", "teacher", "student"],
  },
  {
    to: "/exams",
    label: "Exams & Grades",
    icon: FileText,
    roles: ["admin", "teacher", "student"],
  },
  { to: "/fees", label: "Fees", icon: Receipt, roles: ["admin", "student"] },
  {
    to: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    roles: ["admin", "teacher", "student"],
  },
  { to: "/audit", label: "Audit Log", icon: History, roles: ["admin"] },
  { to: "/profile", label: "Account", icon: IdCard, roles: ["admin", "teacher"] },
  { to: "/profile", label: "Account", icon: UserCog, roles: ["student"] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const visible = NAV.filter((item) => item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          onClick={onClose}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar",
          "transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-4.5" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight text-sidebar-foreground">
              Scholaris
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {visible.map(({ to, label, icon: Icon, labelByRole }) => (
            <NavLink
              key={label}
              to={to}
              end={to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-sidebar-foreground/80 hover:bg-secondary/60 hover:text-foreground",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {labelByRole?.[user.role] ?? label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {initials(user.firstName, user.lastName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
