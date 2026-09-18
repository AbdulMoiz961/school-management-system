# Phases 3–7 — Detailed Plan

Status: Phases 1–2 complete (foundation + auth). This document plans the rest.
Each phase ends with something you can click through, and is committed separately.

---

## Guiding decisions

- **Vertical slices.** Every phase ships working, visible features — never a half-built layer.
- **Server-side authorisation always.** Route guards are UX; the API re-checks everything.
- **Shared types first.** Any new entity gets its type in `shared/` before either side uses it.
- **Audit + validation from the start**, not bolted on later (it's what makes this read as senior work).
- **Division of labour:** I build, typecheck, and run API-level tests; you verify the UI in a browser.

---

## Phase 3 — Core CRUD (the biggest visible chunk)

**Entities:** Classes/Sections, Subjects, Students, Teachers.

### Data model
- `ClassSection` — gradeLevel, section, capacity, classTeacher
- `Subject` — name, code (unique), creditHours, classSection, teacher
- `Student` — links to a `User`, rollNumber (auto-generated), guardian info, classSection
- `Teacher` — links to a `User`, employeeId (auto), subjectCodes, phone

### Product decisions (flagging the important ones)
- **Students/Teachers are two-part:** a `User` (login credentials) + a `Student`/`Teacher`
  profile (academic data). One teacher can log in *and* be assigned to classes. This is
  the correct model — and it's why auth came first.
- **Roll numbers auto-generated** as `STU-<year>-<sequence>`, employee IDs as `EMP-<sequence>`.
  Manual entry invites duplicates; the server owns it.
- **Deletion is soft by default.** A student with attendance/grades shouldn't vanish —
  `isActive: false` instead. Hard delete only for records with no dependents.

### API surface
```
GET    /api/classes            list (paginated, search, filter)
POST   /api/classes            admin only
GET    /api/classes/:id
PATCH  /api/classes/:id        admin only
DELETE /api/classes/:id        admin only (blocked if students assigned)

GET    /api/subjects           list + filter by class/teacher
POST   /api/subjects           admin only
PATCH  /api/subjects/:id       admin only
DELETE /api/subjects/:id       admin only

GET    /api/students           list (paginated, search, filter by class)
GET    /api/students/:id
POST   /api/students           admin only — creates User + profile together
PATCH  /api/students/:id       admin only
DELETE /api/students/:id       admin only (soft)

GET    /api/teachers           admin only
POST   /api/teachers           admin only
PATCH  /api/teachers/:id       admin only
DELETE /api/teachers/:id       admin only (soft)

GET    /api/me/student         student's own profile
GET    /api/me/teacher         teacher's own profile
```

### Frontend
- Reusable **DataTable** component: sortable columns, search, pagination, row actions
- Modal/drawer forms with zod validation and field-level errors
- Students list + detail page (profile, class, quick stats)
- Teachers, Classes, Subjects list + form views
- Delete confirmations via AlertDialog

### Definition of done
- [ ] All four entities CRUD'able through the UI
- [ ] Pagination + search working server-side (not client-filtering a full dump)
- [ ] A teacher account cannot edit students; a student sees only their own profile
- [ ] Deleting a class with students assigned is refused with a clear message
- [ ] You've clicked through every screen

---

## Phase 4 — Daily Operations

### Attendance
- `POST /api/attendance/register` — submit a whole class register for (subject, date) in one request
- Unique constraint on (student, subject, date) so double-marking is impossible
- Teachers may only mark their own subjects; edits limited to a configurable window
- `GET /api/attendance/summary/:studentId` — totals + percentage
- Frontend: fast register grid (keyboard-friendly), monthly calendar view for students

### Timetable (the standout feature)
- Weekly grid per class section
- **Conflict detection** — a slot is rejected if it would double-book a teacher, a room,
  or the class itself, with the clashing slot identified in the error
- `GET /api/timetable/conflicts` — a pre-flight check the UI can call before saving
- Frontend: drag-friendly grid, conflicts highlighted inline
- **This is the most technically interesting piece** — real constraint logic, not CRUD

### Announcements
- Targeted by role and/or class section; read receipts

### Definition of done
- [ ] A teacher marks a register and the student sees the result
- [ ] Attempting to double-book a teacher is rejected with a specific message
- [ ] Announcement visible only to its target audience

---

## Phase 5 — Assessment

### Assignments + Submissions
- Teacher creates an assignment for a subject with a due date
- Student submits text (and optionally a link/file)
- `isLate` computed server-side from the due date — never trusted from the client
- Teacher grades: marks + feedback

### Exams + Grades
- Exam definitions per subject with max marks
- Bulk marks entry grid for teachers
- **Report card** per student: per-subject results, totals, percentage, letter grade
- `GET /api/exams/report-card/:studentId`

### Definition of done
- [ ] Full assignment lifecycle: create → submit → grade → student sees feedback
- [ ] Report card computes correct grades from entered marks
- [ ] A student cannot see another student's marks (server-enforced)

---

## Phase 6 — Admin & Ops

### Fees
- Fee structures, invoice generation, partial payments, status (unpaid/partial/paid/overdue)
- Payment recording with method + reference
- Student sees their own invoices only

### Dashboard & Analytics
- **Role-specific** dashboards — admin sees institution-wide, teacher sees their classes,
  student sees their own performance
- Charts via recharts: attendance trends, grade distribution, fee collection
- **At-risk student flagging** — low attendance or falling grades surfaced automatically

### Audit Log
- Records actor, action, resource, and **field-level diffs** for updates
- Admin-only viewer with filtering
- Written by a service-layer helper so it can't be forgotten

### Definition of done
- [ ] Charts render real aggregates, not placeholders
- [ ] A fee payment updates invoice status correctly
- [ ] Editing a student produces a readable audit entry

---

## Phase 7 — Hardening & Ship

- **Tests** — Vitest + supertest covering the critical service paths
  (auth, RBAC enforcement, attendance uniqueness, timetable conflicts, grade computation)
- **CI extended** to run the test suite on every PR
- **Deployment:**
  - client → Vercel
  - server → Render
  - database → MongoDB Atlas (already provisioned)
- **Production checklist** — env vars on hosts, CORS locked to the deployed client origin,
  `secure` cookies verified over HTTPS, Atlas network access reviewed
- **README polish** — architecture diagram, screenshots, live demo link, demo credentials
- **Demo mode** — one-click role switching so a reviewer can explore all three roles fast

---

## Suggested order & rough effort

| Phase | Focus | Rough size |
| ----- | ----- | ---------- |
| 3 | Core CRUD (4 entities + DataTable) | Largest |
| 4 | Attendance + timetable conflicts | Medium-large |
| 5 | Assignments, exams, grades | Medium |
| 6 | Fees, dashboards, audit | Medium-large |
| 7 | Tests, deploy, polish | Medium |

Phase 3 is deliberately the biggest — it establishes the patterns (DataTable,
form modal, pagination, list endpoints) that every later phase reuses. Get it
right and the rest move quickly.

---

## Open questions to settle before Phase 3

1. **Scope of a student's own view** — read-only, or should students edit their profile?
2. **File uploads** — needed for assignment submissions, or is text + link enough?
   (Uploads require storage: local disk won't survive a Render redeploy.)
3. **Terms/semesters** — do we model academic terms, or keep a single flat timeline?
   Terms add realism but touch every entity.
4. **Room booking in the timetable** — full room management, or just a free-text room field?
