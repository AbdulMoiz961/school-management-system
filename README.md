# Scholaris — School Management System

A full-stack school management system built with the MERN stack and TypeScript.
Role-aware access for administrators, teachers and students, covering academic
records, attendance, timetabling, assessment, fees and a field-level audit trail.

Built as a portfolio project to demonstrate production-style architecture:
strict typing end to end, server-enforced authorisation, referential integrity,
and business rules that live in the database rather than in the UI.

---

## Contents

- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Security design](#security-design)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Verification](#verification)
- [Project structure](#project-structure)
- [Notes and limitations](#notes-and-limitations)

---

## Tech stack

| Layer      | Technology                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| Frontend   | React 19, Vite, TypeScript, Tailwind CSS v4, React Router, TanStack Query     |
| Backend    | Node.js, Express, TypeScript, Zod validation                                 |
| Database   | MongoDB (Atlas) with Mongoose                                                |
| Auth       | JWT access tokens, rotating httpOnly refresh cookies, bcrypt                 |
| Tooling    | npm workspaces (monorepo), GitHub Actions CI                                 |

---

## Architecture

The repository is an npm workspace monorepo with three packages:

```
school-management-system/
├── client/          React single-page application (Vite)
├── server/          Express API
├── shared/          Domain types imported by both client and server
└── scripts/         End-to-end verification suites
```

### Request layering

```
route -> middleware -> controller (thin) -> service (logic) -> model (data)
```

Controllers handle HTTP concerns only and never contain business logic. Services
hold the business rules and never touch `req` or `res`, which keeps them
testable in isolation. This separation is what keeps the codebase navigable as
it grows: every feature follows the same five-file shape of model, validator,
service, controller and route.

### Shared types

`shared/src/index.ts` is the single source of truth for the API contract. Both
the client and the server import the same definitions, so changing a response
shape breaks the build on both sides immediately rather than drifting silently.
Types such as `Paginated<T>`, `ListQuery` and `ApiErrorBody` are shared, as is
the grade scale in `shared/src/grading.ts`, which prevents the API and the UI
from ever disagreeing about what an 82% is worth.

---

## Features

### Academic core

- **Terms** with a single-current-term invariant enforced in the schema.
- **Classes and sections** with capacity limits that cannot be reduced below
  current enrolment.
- **Subjects** with unique codes per term and teacher assignment.
- **Students and teachers** modelled as a login account plus an academic
  profile. Roll numbers (`STU-2026-0001`) and employee IDs (`EMP-0001`) are
  generated atomically from a counter collection, so concurrent creates cannot
  collide.

### Attendance

- A class register is marked for a subject and date in a single request.
- A unique index on `(student, subject, day)` makes double-marking impossible at
  the database level rather than relying on an application check that could race.
- Re-saving a register updates existing rows, so correcting a mistake never
  creates duplicates.
- Dates are normalised to UTC midnight; storing raw timestamps would allow the
  same calendar day to produce two documents.

### Timetable with conflict detection

- Slots are stored as minutes since midnight, making overlap a plain integer
  comparison.
- Overlap uses half-open intervals `[start, end)`. A lesson ending at 10:00 and
  the next beginning at 10:00 are adjacent, not clashing, which is the correct
  model for a timetable.
- Three constraints are enforced on both create and update: the teacher cannot
  be in two places at once, the class cannot be in two lessons at once, and an
  update ignores the row it is replacing so it cannot conflict with itself.
- Clashes return `409` naming the specific conflicting slot. A separate
  pre-flight endpoint lets the interface warn before a save is attempted.

### Assessment

- **Assignments** with due dates; submissions accept text, a link, or both.
- `isLate` is computed server-side against the due date. The client cannot
  supply it, so a student cannot claim to have submitted on time.
- Once graded, a submission is locked, because changing it would invalidate
  marks already awarded.
- **Exams** with a marks-entry sheet covering a whole class, reusing the same
  load-and-save pattern as the attendance register.
- **Report cards** combine exam marks and graded assignments per subject into
  obtained and maximum totals, then derive a percentage and letter grade. Only
  subjects the student's class actually takes appear on the card.

### Fees

- Invoices with partial payments. Status (`unpaid`, `partial`, `paid`,
  `overdue`) is derived from the balance and due date, never stored, so it
  cannot go stale.
- Over-payment is rejected so a balance cannot be driven negative.

### Dashboard and analytics

- A single role-scoped endpoint returns counts, an attendance average, fee
  collected versus outstanding, flagged students, and recent activity.
- **At-risk flagging** identifies students below 75% attendance or 50% overall
  grade, listing the specific reason for each.

### Audit trail

- Every create, update and delete writes an immutable log entry.
- Updates record a field-level diff with the before and after values.
- Password fields are redacted by the diff helper.
- Update and delete hooks on the log model throw, so entries cannot be altered
  after the fact.

---

## Security design

These are deliberate choices, not framework defaults:

- **Access tokens are short-lived (15 minutes) and held in memory only** on the
  client, never in `localStorage`, so an XSS payload cannot exfiltrate them.
- **Refresh tokens live in an httpOnly, SameSite cookie**, unreadable from
  JavaScript. The client refreshes silently on boot and on a `401`.
- **Refresh-token rotation with reuse detection.** Each token is issued with a
  version counter and only its hash is stored. Logging out or changing a
  password increments the counter, instantly invalidating every outstanding
  token for that user.
- **Role is never trusted from the client.** Public registration always creates
  a student; attempting to register with `role: "admin"` is silently downgraded.
- **Authorisation is enforced server-side.** Route guards in the UI are a
  convenience only; every endpoint re-checks permissions independently.
- **Student self-service is field-scoped at the schema level.** The endpoint for
  editing one's own profile accepts only contact fields, so academic data
  cannot be altered by sending extra keys.
- **Teacher data isolation.** Teachers see only students in classes they teach
  or are class teacher of, and can only manage assessments for their own
  subjects. Enforced in the service layer, not the UI.
- **Query injection is contained.** Search terms are regex-escaped per term and
  sort fields are validated against an allow-list.
- **Uniform login errors** ("Invalid email or password") so the API does not
  reveal which addresses are registered.
- **Password hashing** with bcrypt (cost 12); the field is `select: false` so it
  cannot leak through a careless query.
- **Rate limiting** globally, with a much stricter limit on authentication.

---

## Getting started

### Prerequisites

- Node.js 20 or later, and npm
- A MongoDB connection string. A free Atlas M0 cluster is sufficient; the
  application also runs against a local `mongod`.

### 1. Install

```bash
npm install
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and supply a connection string and two secrets:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/school_management

# Generate a strong value for each secret, separately:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET=<random value>
JWT_REFRESH_SECRET=<different random value>
```

`.env` is gitignored. Use distinct values for the two secrets so that a leaked
access secret cannot be used to mint refresh tokens.

### 3. Seed demo data

```bash
npm run seed
```

This creates a coherent demo dataset: one current term, a class with a teacher
assigned, two subjects, and linked teacher and student profiles. Re-running it
updates existing records rather than duplicating them.

| Email                  | Role    | Password      |
| ---------------------- | ------- | ------------- |
| admin@scholaris.dev    | admin   | `Password123` |
| teacher@scholaris.dev  | teacher | `Password123` |
| student@scholaris.dev  | student | `Password123` |

These are demo credentials for local exploration only.

### 4. Run

```bash
npm run dev        # API on :5000 and client on :5173
```

Open <http://localhost:5173>. Vite proxies `/api` to the API, so cookies remain
same-origin during development.

---

## Scripts

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Run the API and client concurrently                  |
| `npm run build`      | Build shared, server and client                      |
| `npm run typecheck`  | Typecheck every workspace                            |
| `npm run seed`       | Create the demo dataset                              |
| `npm run clean:test` | Remove verification fixtures                         |
| `npm run verify:api` | Run the API verification suite (75 checks)           |
| `npm run verify:ui`  | Run the browser verification suite (36 checks)       |

---

## API reference

Base path is `/api`. Every successful response uses one envelope:

```jsonc
{ "success": true, "data": { /* ... */ } }
```

List endpoints add pagination:

```jsonc
{
  "success": true,
  "data": {
    "items": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 }
  }
}
```

Errors:

```jsonc
{
  "success": false,
  "message": "Validation failed",
  "errors": { "email": ["Enter a valid email address"] },
  "code": "VALIDATION_ERROR"
}
```

### Endpoint summary

There are 66 route handlers across the following groups. List endpoints accept
`page`, `limit`, `search`, `sortBy`, `sortDir` and `includeInactive`.

| Group          | Endpoints                                                                        | Access               |
| -------------- | -------------------------------------------------------------------------------- | -------------------- |
| System         | `/health`, `/system/status`                                                       | public               |
| Auth           | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`       | mixed                |
| Terms          | `/terms`, `/terms/current`, `/terms/:id`                                          | read: authenticated  |
| Classes        | `/classes`, `/classes/:id`                                                        | read: authenticated  |
| Subjects       | `/subjects`, `/subjects/:id`                                                      | read: authenticated  |
| Students       | `/students`, `/students/:id`, `/students/me`                                      | staff; self-service  |
| Teachers       | `/teachers`, `/teachers/:id`, `/teachers/me`                                      | admin                |
| Attendance     | `/attendance/register`, `/attendance/summary/:id`, `/attendance/class/:id`, `/attendance/history` | staff; own record    |
| Timetable      | `/timetable`, `/timetable/check`, `/timetable/:id`                                 | read: authenticated  |
| Assignments    | `/assignments`, `/assignments/:id/submit`, `/assignments/:id/submissions`, `/submissions/:id/grade` | staff; submit: student |
| Exams          | `/exams`, `/exams/:id/sheet`, `/exams/:id/marks`                                   | staff                |
| Results        | `/results/me`, `/results/report-card/:studentId`                                   | own record           |
| Fees           | `/fees`, `/fees/me`, `/fees/:id/payments`                                          | admin; own invoices  |
| Announcements  | `/announcements`, `/announcements/:id/acknowledge`                                 | read: authenticated  |
| Dashboard      | `/dashboard`                                                                      | authenticated        |
| Audit          | `/audit`                                                                          | admin                |

Write operations on academic entities are restricted to administrators, except
where a teacher is acting within their own subjects.

---

## Verification

The repository includes two end-to-end suites that exercise the running
application. They create their own fixtures and clean up afterwards, so both are
safe to re-run against a live database.

```bash
npm run verify:api    # 75 API checks across all phases
npm run verify:ui     # 36 browser checks across the three roles
```

Additionally, per-phase suites are kept in `scripts/` so the checks for each
feature area remain readable:

| File                          | Scope                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| `scripts/api-verify.sh`       | Auth, CRUD, RBAC, pagination, referential integrity, audit    |
| `scripts/api-verify-phase4.sh`| Attendance, timetable conflicts, announcements (68 checks)    |
| `scripts/api-verify-phase5.sh`| Assignments, submissions, exams, report cards (48 checks)     |
| `scripts/api-verify-phase6.sh`| Fees, dashboard, at-risk flagging (31 checks)                 |
| `scripts/ui-verify.py`        | All three roles across every page                             |
| `scripts/ui-verify-phase4.py` | Attendance, timetable, announcements in the browser          |
| `scripts/ui-verify-phase5.py` | Assignments, exams and results in the browser                |
| `scripts/ui-verify-phase6.py` | Fees and dashboard in the browser                            |

Areas covered include role escalation attempts, cross-student data access,
forged client fields such as `isLate`, over-payment, marks beyond the maximum,
capacity reduced below enrolment, and regex injection through search.

The client and server browser suites require Python 3 with Playwright:

```bash
pip install playwright && playwright install chromium
```

---

## Project structure

```
├── client/
│   └── src/
│       ├── api/           typed fetch client with automatic token refresh
│       ├── components/    UI primitives, data table, forms, layout, sidebar
│       ├── features/      feature-scoped logic (authentication context)
│       ├── lib/           list-state and query helpers
│       ├── pages/         route-level views, one per module
│       └── routes/        router configuration and route guards
├── server/
│   └── src/
│       ├── config/        environment parsing and database connection
│       ├── middleware/    authentication, RBAC, validation, error handling
│       ├── models/        Mongoose schemas and invariants
│       ├── routes/        Express routers
│       ├── scripts/       seed and test-data cleanup
│       ├── services/      business logic
│       ├── utils/         response helpers, query building, errors
│       └── validators/    Zod request schemas
├── shared/
│   └── src/               domain types and the grade scale
└── scripts/               verification suites
```

---

## Notes and limitations

- **Assignment submissions accept text or a link, not file uploads.** Handling
  uploads properly requires object storage such as S3 or Cloudinary; writing to
  local disk would lose files on redeploy. This is the intended scope, and
  adding storage later is contained to one service.
- **Demo credentials are committed in the seed script.** They are local
  development accounts and are not intended for any deployed environment.
- **The API has no automated unit tests at the service layer.** Verification is
  currently end-to-end against a running server and a real database, which
  exercises the same paths the interface uses. Unit tests would be the natural
  next addition.
- The client bundle is a single chunk. Code-splitting by route would be the
  sensible next step if the application grew further.

---

## License

MIT. A portfolio project by [Abdul Moiz](https://github.com/AbdulMoiz961).
