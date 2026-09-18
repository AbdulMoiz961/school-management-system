/**
 * Shared domain types — imported by BOTH the Express API and the React client.
 * Keeping one definition here means the API contract can't drift between the two.
 */

/* ------------------------------------------------------------------ *
 * Roles & permissions
 * ------------------------------------------------------------------ */

export const ROLES = ["admin", "teacher", "student"] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const FEE_STATUSES = ["unpaid", "partial", "paid", "overdue"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * Academic calendar
 * ------------------------------------------------------------------ */

export const TERM_STATUSES = ["upcoming", "active", "completed"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

export interface AcademicTerm {
  id: string;
  name: string;
  /** e.g. "2026-2027" */
  academicYear: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
  /** Only one term may be active at a time; enforced server-side. */
  isCurrent: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export interface UserSummary {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
}

/** Shape of a successful auth payload from POST /api/auth/login. */
export interface AuthResult {
  user: UserSummary;
  /** Short-lived JWT. The refresh token is delivered as an httpOnly cookie. */
  accessToken: string;
}

/* ------------------------------------------------------------------ *
 * Academic entities
 * ------------------------------------------------------------------ */

export interface ClassSection {
  id: string;
  /** e.g. "Grade 10" */
  gradeLevel: string;
  /** e.g. "A" */
  section: string;
  capacity: number;
  /** Class teacher's user id, if assigned. */
  classTeacherId?: string;
  classTeacherName?: string;
  /** Academic term this class belongs to. */
  termId?: string;
  isActive: boolean;
  /** Number of students currently assigned (computed, not stored). */
  studentCount?: number;
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  /** e.g. "MATH-10" */
  code: string;
  creditHours: number;
  classSectionId?: string;
  classSectionName?: string;
  teacherId?: string;
  teacherName?: string;
  termId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Student {
  id: string;
  userId: string;
  /** e.g. "STU-2026-0001" — server-generated, never client-supplied. */
  rollNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  /** Personal contact fields a student IS allowed to edit on their own profile. */
  phone?: string;
  address?: string;
  classSectionId?: string;
  classSectionName?: string;
  termId?: string;
  isActive: boolean;
  enrolledAt: string;
}

export interface Teacher {
  id: string;
  userId: string;
  /** e.g. "EMP-0001" — server-generated. */
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Subject codes this teacher can teach. */
  subjectCodes: string[];
  isActive: boolean;
  joinedAt: string;
}

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

export interface AttendanceRecord {
  id: string;
  studentId: string;
  subjectId: string;
  /** ISO date, day granularity. */
  date: string;
  status: AttendanceStatus;
  note?: string;
  markedBy: string;
  createdAt: string;
}

export interface AttendanceSummary {
  studentId: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** 0–100. */
  percentage: number;
}

/** A class register: one row per student for a given subject + date. */
export interface AttendanceRegisterRow {
  studentId: string;
  rollNumber: string;
  name: string;
  status: AttendanceStatus;
}

/* ------------------------------------------------------------------ *
 * Timetable
 * ------------------------------------------------------------------ */

export interface TimetableSlot {
  id: string;
  classSectionId: string;
  subjectId: string;
  teacherId: string;
  day: Weekday;
  /** "HH:mm" 24h, e.g. "09:30". */
  startTime: string;
  endTime: string;
  room?: string;
}

export interface TimetableConflict {
  kind: "teacher" | "room" | "class";
  message: string;
  /** Slots that clash. */
  conflictingSlotIds: string[];
}

/* ------------------------------------------------------------------ *
 * Assessment
 * ------------------------------------------------------------------ */

export interface Assignment {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  dueDate: string;
  maxMarks: number;
  createdBy: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  content?: string;
  fileUrl?: string;
  submittedAt: string;
  isLate: boolean;
  marks?: number;
  feedback?: string;
  gradedBy?: string;
  gradedAt?: string;
}

export interface Exam {
  id: string;
  subjectId: string;
  name: string;
  examDate: string;
  maxMarks: number;
  createdAt: string;
}

export interface ExamMark {
  id: string;
  examId: string;
  studentId: string;
  marks: number;
  enteredBy: string;
  updatedAt: string;
}

/** Computed per-subject result used on the report card. */
export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  obtained: number;
  max: number;
  percentage: number;
  /** Letter grade derived from percentage. */
  grade: string;
}

export interface ReportCard {
  studentId: string;
  studentName: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
  overallGrade: string;
}

/* ------------------------------------------------------------------ *
 * Fees
 * ------------------------------------------------------------------ */

export interface FeeInvoice {
  id: string;
  studentId: string;
  title: string;
  amount: number;
  currency: string;
  dueDate: string;
  amountPaid: number;
  status: FeeStatus;
  payments: FeePayment[];
  createdAt: string;
}

export interface FeePayment {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  recordedBy: string;
  reference?: string;
}

/* ------------------------------------------------------------------ *
 * Ops
 * ------------------------------------------------------------------ */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Empty array = visible to every role. */
  audienceRoles: Role[];
  classSectionId?: string;
  classSectionName?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorEmail: string;
  action: "create" | "update" | "delete";
  resource: string;
  resourceId: string;
  /** Human-readable label for the affected record, captured at write time. */
  resourceLabel?: string;
  /** Field-level diff. Only populated for updates. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  at: string;
}

/* ------------------------------------------------------------------ *
 * API envelope
 * ------------------------------------------------------------------ */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Every list endpoint returns this shape. */
export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

/** Standard list query params — shared so client and server agree on names. */
export interface ListQuery {
  page?: number;
  limit?: number;
  /** Free-text search across the entity's searchable fields. */
  search?: string;
  /** Field to sort by; validated against an allow-list server-side. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  /** Include soft-deleted (inactive) records. Admin-only in practice. */
  includeInactive?: boolean;
}

/* ------------------------------------------------------------------ *
 * Create / update payloads
 * ------------------------------------------------------------------ */

export interface TermInput {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status?: TermStatus;
  isCurrent?: boolean;
}

export interface ClassSectionInput {
  gradeLevel: string;
  section: string;
  capacity: number;
  classTeacherId?: string;
  termId?: string;
}

export interface SubjectInput {
  name: string;
  code: string;
  creditHours: number;
  classSectionId?: string;
  teacherId?: string;
  termId?: string;
}

/** Admin creating a student: provisions the login AND the academic profile. */
export interface StudentCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  /** Optional — if omitted the server generates a temporary one. */
  password?: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  phone?: string;
  address?: string;
  classSectionId?: string;
}

/**
 * What a student may edit on their OWN profile — deliberately narrow.
 * Academic fields (roll number, class, term) are admin-only.
 */
export interface StudentSelfUpdateInput {
  phone?: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
}

/** Admin updating any student field. */
export interface StudentAdminUpdateInput extends StudentSelfUpdateInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  isActive?: boolean;
}

export interface TeacherCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string;
  subjectCodes?: string[];
}

export interface TeacherUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  subjectCodes?: string[];
  isActive?: boolean;
}

/** Every successful single-resource response is wrapped in this. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Every error response is wrapped in this. */
export interface ApiErrorBody {
  success: false;
  message: string;
  /** Present for validation failures; keyed by field path. */
  errors?: Record<string, string[]>;
  code?: string;
}
