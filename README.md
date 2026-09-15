# Scholaris — School Management System

A production-style school management system built with the **MERN stack and TypeScript**.
Role-aware access for administrators, teachers and students, with academic records,
attendance, timetabling, assessment, fees and an audit trail.

> **Status:** Phase 1–2 complete (foundation + authentication). Core modules in progress.
> See [Roadmap](#roadmap).

---

## Tech stack

| Layer     | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Frontend  | React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router · TanStack Query |
| Backend   | Node.js · Express · TypeScript · Zod validation                            |
| Database  | MongoDB (Atlas) · Mongoose                                                 |
| Auth      | JWT access tokens + rotating httpOnly refresh cookies · bcrypt             |
| Tooling   | npm workspaces (monorepo) · Vitest · GitHub Actions CI                     |

---

## Architecture

```
school-management-system/
├── client/                 React SPA (Vite)
│   └── src/
│       ├── api/            typed fetch client, automatic token refresh
│       ├── components/     UI primitives, layout, sidebar
│       ├── features/       feature-scoped logic (auth, …)
│       ├── pages/          route-level views
│       └── routes/         router config + route guards
├── server/                 Express API
│   └── src/
│       ├── config/         env parsing, database connection
│       ├── controllers/    thin HTTP layer (no business logic)
│       ├── middleware/     auth, RBAC, validation, error handling
│       ├── models/         Mongoose schemas
│       ├── routes/         Express routers
│       ├── scripts/        seed script
│       ├── services/       business logic (the substantial part)
│       ├── utils/          ApiError, catchAsync, tokens
│       └── validators/     Zod request schemas
└── shared/                 domain types imported by BOTH client and server
```

### Layering rule

```
route → middleware → controller (thin) → service (logic) → model (data)
```

Controllers never contain business logic; services never touch `req`/`res`.
This separation is what keeps the codebase navigable as it grows.

### Shared types

`shared/src/index.ts` is the single source of truth for API contracts. Because
both the client and server import the same definitions, a change to a response
shape breaks the build on both sides at once instead of silently drifting.

---

## Security design

These are deliberate decisions, not defaults:

- **Access tokens are short-lived** (15 min) and held **in memory only** on the
  client — never `localStorage`, so an XSS payload cannot exfiltrate them.
- **Refresh tokens** live in an **httpOnly, SameSite cookie**, so JavaScript
  cannot read them. The client silently refreshes on boot and on a 401.
- **Refresh-token rotation with a version counter.** Logging out or changing a
  password increments `refreshTokenVersion`, instantly invalidating every
  outstanding refresh token for that user.
- **Role is never trusted from the client.** Public sign-up always creates a
  `student`; privileged accounts are provisioned separately. Attempting to
  register with `role: "admin"` is silently downgraded (covered by a test).
- **Authorisation is enforced server-side**, not merely hidden in the UI.
  Route guards are a UX convenience; every endpoint re-checks permissions.
- **Uniform error messages** on login ("Invalid email or password") so the API
  does not reveal which email addresses are registered.
- **Password hashing** with bcrypt (cost 12), and `password` is `select: false`
  on the schema so it cannot leak through a careless query.
- **Rate limiting** — a global limit plus a much stricter one on auth routes.

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- A MongoDB connection string (a free [Atlas](https://cloud.mongodb.com) M0 cluster works well)

### 1. Install

```bash
npm install
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/school_management

# Generate strong secrets:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET=<strong-random-value>
JWT_REFRESH_SECRET=<strong-random-value>
```

> `.env` is gitignored. Never commit real credentials.

### 3. Seed demo data

```bash
npm run seed
```

Creates three accounts (all with password `Password123`):

| Email                  | Role    |
| ---------------------- | ------- |
| `admin@scholaris.dev`   | admin   |
| `teacher@scholaris.dev` | teacher |
| `student@scholaris.dev` | student |

### 4. Run

```bash
npm run dev          # server (:5000) + client (:5173) together
# or individually:
npm run dev:server
npm run dev:client
```

Open **http://localhost:5173**.

Vite proxies `/api` → `localhost:5000`, so cookies stay same-origin in dev.

---

## Scripts

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `npm run dev`                    | Run API and client concurrently          |
| `npm run build`                  | Build shared, server and client          |
| `npm run typecheck`              | Typecheck every workspace                |
| `npm run seed`                   | Create demo accounts                     |
| `npm run test`                   | Run tests                                |

---

## API

Base path `/api`. Successful responses share one envelope:

```jsonc
{ "success": true, "data": { /* … */ } }
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

### Implemented

| Method   | Endpoint                   | Access        | Purpose                       |
| -------- | -------------------------- | ------------- | ----------------------------- |
| `GET`    | `/health`                  | public        | Liveness probe                |
| `GET`    | `/api/system/status`       | public        | DB + API status               |
| `POST`   | `/api/auth/register`       | public        | Create a student account      |
| `POST`   | `/api/auth/login`          | public        | Sign in                       |
| `POST`   | `/api/auth/refresh`        | cookie        | Rotate tokens                 |
| `POST`   | `/api/auth/logout`         | authenticated | Invalidate refresh tokens     |
| `GET`    | `/api/auth/me`             | authenticated | Current user                  |
| `PATCH`  | `/api/auth/me`             | authenticated | Update name / avatar          |
| `POST`   | `/api/auth/change-password`| authenticated | Change password               |

### Planned

`/api/students` · `/api/teachers` · `/api/classes` · `/api/subjects` ·
`/api/attendance` · `/api/timetable` · `/api/assignments` · `/api/exams` ·
`/api/fees` · `/api/announcements` · `/api/audit`

---

## Roadmap

- [x] **Phase 1** — Monorepo, tooling, Express foundation, error handling, validation
- [x] **Phase 2** — Authentication, refresh rotation, RBAC, route guards, login UI
- [ ] **Phase 3** — Core CRUD: students, teachers, classes, subjects
- [ ] **Phase 4** — Attendance registers, timetable with conflict detection
- [ ] **Phase 5** — Assignments, submissions, exams, grades, report cards
- [ ] **Phase 6** — Fees, dashboards with charts, audit log
- [ ] **Phase 7** — Tests, deployment, seed data polish

### Planned highlights

- **Timetable conflict detection** — rejects a slot that double-books a teacher,
  a room or a class, rather than allowing invalid schedules.
- **Attendance analytics** — per-student percentages and at-risk flagging.
- **Audit trail** — field-level change history with actor attribution.
- **Optimistic UI** — instant feedback with rollback on failure.

---

## License

MIT — a portfolio project by [Abdul Moiz](https://github.com/AbdulMoiz961).
