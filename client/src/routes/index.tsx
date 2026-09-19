import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, RoleRoute, GuestRoute } from "./guards";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import TermsPage from "@/pages/terms";
import ClassesPage from "@/pages/classes";
import SubjectsPage from "@/pages/subjects";
import StudentsPage from "@/pages/students";
import TeachersPage from "@/pages/teachers";
import AuditPage from "@/pages/audit";
import ProfilePage from "@/pages/profile";
import { ComingSoon } from "@/pages/coming-soon";

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />

      {/* Dashboard — any authenticated role */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* --- Phase 3: implemented modules --- */}

      {/* Terms — admins manage, everyone reads */}
      <Route
        path="/terms"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <TermsPage />
          </RoleRoute>
        }
      />

      {/* Classes */}
      <Route
        path="/classes"
        element={
          <RoleRoute roles={["admin", "teacher"]}>
            <ClassesPage />
          </RoleRoute>
        }
      />

      {/* Subjects */}
      <Route
        path="/subjects"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <SubjectsPage />
          </RoleRoute>
        }
      />

      {/* Students — page renders a self-service view for the student role */}
      <Route
        path="/students"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <StudentsPage />
          </RoleRoute>
        }
      />

      {/* Teachers — admin only */}
      <Route
        path="/teachers"
        element={
          <RoleRoute roles={["admin"]}>
            <TeachersPage />
          </RoleRoute>
        }
      />

      {/* Audit log — admin only */}
      <Route
        path="/audit"
        element={
          <RoleRoute roles={["admin"]}>
            <AuditPage />
          </RoleRoute>
        }
      />

      {/* Profile — everyone */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* --- Later phases --- */}

      <Route
        path="/attendance"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Attendance" phase="Phase 4 — Daily operations" />
          </RoleRoute>
        }
      />

      <Route
        path="/timetable"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Timetable" phase="Phase 4 — Daily operations" />
          </RoleRoute>
        }
      />

      <Route
        path="/assignments"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Assignments" phase="Phase 5 — Assessment" />
          </RoleRoute>
        }
      />

      <Route
        path="/exams"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Exams & Grades" phase="Phase 5 — Assessment" />
          </RoleRoute>
        }
      />

      <Route
        path="/fees"
        element={
          <RoleRoute roles={["admin", "student"]}>
            <ComingSoon title="Fees" phase="Phase 6 — Admin & Ops" />
          </RoleRoute>
        }
      />

      <Route
        path="/announcements"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Announcements" phase="Phase 6 — Admin & Ops" />
          </RoleRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
