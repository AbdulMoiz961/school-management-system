import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, RoleRoute, GuestRoute } from "./guards";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
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

      {/* Students */}
      <Route
        path="/students"
        element={
          <RoleRoute roles={["admin", "teacher"]}>
            <ComingSoon title="Students" phase="Phase 3 — Core CRUD" />
          </RoleRoute>
        }
      />
      <Route
        path="/students/:id"
        element={
          <RoleRoute roles={["admin", "teacher"]}>
            <ComingSoon title="Student profile" phase="Phase 3 — Core CRUD" />
          </RoleRoute>
        }
      />

      {/* Teachers — admin only */}
      <Route
        path="/teachers"
        element={
          <RoleRoute roles={["admin"]}>
            <ComingSoon title="Teachers" phase="Phase 3 — Core CRUD" />
          </RoleRoute>
        }
      />

      {/* Classes */}
      <Route
        path="/classes"
        element={
          <RoleRoute roles={["admin", "teacher"]}>
            <ComingSoon title="Classes & Sections" phase="Phase 3 — Core CRUD" />
          </RoleRoute>
        }
      />

      {/* Subjects */}
      <Route
        path="/subjects"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Subjects" phase="Phase 3 — Core CRUD" />
          </RoleRoute>
        }
      />

      {/* Attendance */}
      <Route
        path="/attendance"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Attendance" phase="Phase 4 — Daily operations" />
          </RoleRoute>
        }
      />

      {/* Timetable */}
      <Route
        path="/timetable"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Timetable" phase="Phase 4 — Daily operations" />
          </RoleRoute>
        }
      />

      {/* Assignments */}
      <Route
        path="/assignments"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Assignments" phase="Phase 5 — Assessment" />
          </RoleRoute>
        }
      />

      {/* Exams */}
      <Route
        path="/exams"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Exams & Grades" phase="Phase 5 — Assessment" />
          </RoleRoute>
        }
      />

      {/* Fees */}
      <Route
        path="/fees"
        element={
          <RoleRoute roles={["admin", "student"]}>
            <ComingSoon title="Fees" phase="Phase 6 — Admin & Ops" />
          </RoleRoute>
        }
      />

      {/* Announcements */}
      <Route
        path="/announcements"
        element={
          <RoleRoute roles={["admin", "teacher", "student"]}>
            <ComingSoon title="Announcements" phase="Phase 6 — Admin & Ops" />
          </RoleRoute>
        }
      />

      {/* Audit — admin only */}
      <Route
        path="/audit"
        element={
          <RoleRoute roles={["admin"]}>
            <ComingSoon title="Audit Log" phase="Phase 6 — Admin & Ops" />
          </RoleRoute>
        }
      />

      {/* Profile */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ComingSoon title="My Profile" phase="Phase 2 — Auth (in progress)" />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
