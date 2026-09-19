import type {
  AcademicTerm,
  ClassSection,
  Student,
  Subject,
  Teacher,
  AuditLogEntry,
  ListQuery,
  Paginated,
  TermInput,
  ClassSectionInput,
  SubjectInput,
  StudentCreateInput,
  StudentAdminUpdateInput,
  StudentSelfUpdateInput,
  TeacherCreateInput,
  TeacherUpdateInput,
} from "@sms/shared";
import { api } from "./client";

/**
 * Builds a querystring from a list-query object, dropping empty values so we
 * don't send `?search=` and similar noise to the API.
 */
function qs(query: object = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ Terms */

export const termsApi = {
  list: (query?: ListQuery) => api.get<Paginated<AcademicTerm>>(`/terms${qs(query)}`),
  current: () => api.get<AcademicTerm | null>("/terms/current"),
  get: (id: string) => api.get<AcademicTerm>(`/terms/${id}`),
  create: (input: TermInput) => api.post<AcademicTerm>("/terms", input),
  update: (id: string, input: Partial<TermInput>) =>
    api.patch<AcademicTerm>(`/terms/${id}`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/terms/${id}`),
};

/* ---------------------------------------------------------------- Classes */

export const classesApi = {
  list: (query?: ListQuery) => api.get<Paginated<ClassSection>>(`/classes${qs(query)}`),
  get: (id: string) => api.get<ClassSection>(`/classes/${id}`),
  create: (input: ClassSectionInput) => api.post<ClassSection>("/classes", input),
  update: (id: string, input: Partial<ClassSectionInput> & { isActive?: boolean }) =>
    api.patch<ClassSection>(`/classes/${id}`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/classes/${id}`),
};

/* --------------------------------------------------------------- Subjects */

export const subjectsApi = {
  list: (query?: ListQuery) => api.get<Paginated<Subject>>(`/subjects${qs(query)}`),
  get: (id: string) => api.get<Subject>(`/subjects/${id}`),
  create: (input: SubjectInput) => api.post<Subject>("/subjects", input),
  update: (id: string, input: Partial<SubjectInput> & { isActive?: boolean }) =>
    api.patch<Subject>(`/subjects/${id}`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/subjects/${id}`),
};

/* --------------------------------------------------------------- Students */

export const studentsApi = {
  list: (query?: ListQuery) => api.get<Paginated<Student>>(`/students${qs(query)}`),
  get: (id: string) => api.get<Student>(`/students/${id}`),
  /** The logged-in student's own profile. */
  me: () => api.get<Student>("/students/me"),
  /** A student editing their own contact details. */
  updateMe: (input: StudentSelfUpdateInput) => api.patch<Student>("/students/me", input),
  create: (input: StudentCreateInput) => api.post<Student>("/students", input),
  update: (id: string, input: StudentAdminUpdateInput) =>
    api.patch<Student>(`/students/${id}`, input),
  /** Soft delete — deactivates rather than removing. */
  remove: (id: string) => api.delete<{ message: string }>(`/students/${id}`),
};

/* --------------------------------------------------------------- Teachers */

export const teachersApi = {
  list: (query?: ListQuery) => api.get<Paginated<Teacher>>(`/teachers${qs(query)}`),
  get: (id: string) => api.get<Teacher>(`/teachers/${id}`),
  me: () => api.get<Teacher>("/teachers/me"),
  create: (input: TeacherCreateInput) => api.post<Teacher>("/teachers", input),
  update: (id: string, input: TeacherUpdateInput) => api.patch<Teacher>(`/teachers/${id}`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/teachers/${id}`),
};

/* ------------------------------------------------------------------ Audit */

export const auditApi = {
  list: (query?: ListQuery & { resource?: string; action?: string }) =>
    api.get<Paginated<AuditLogEntry>>(`/audit${qs(query)}`),
};

export type { Student, Teacher, ClassSection, Subject, AcademicTerm, AuditLogEntry };
