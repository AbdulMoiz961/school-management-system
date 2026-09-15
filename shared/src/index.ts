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
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  /** e.g. "MATH-10" */
  code: string;
  creditHours: number;
  classSectionId?: string;
  teacherId?: string;
  createdAt: string;
}

export interface Student {
  id: string;
  userId: string;
  /** e.g. "STU-2026-0001" */
  rollNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  classSectionId?: string;
  enrolledAt: string;
}

export interface Teacher {
  id: string;
  userId: string;
  /** e.g. "EMP-0012" */
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Subject ids or codes this teacher can teach. */
  subjectCodes: string[];
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
  /** Empty array = visible to everyone. */
  audienceRoles: Role[];
  classSectionId?: string;
  authorId: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: "create" | "update" | "delete";
  resource: string;
  resourceId: string;
  /** Field-level diff for updates. */
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
