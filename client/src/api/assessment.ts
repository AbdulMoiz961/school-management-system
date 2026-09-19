import type {
  Assignment,
  Exam,
  ListQuery,
  Paginated,
  ReportCard,
  Submission,
} from "@sms/shared";
import { api } from "./client";

function qs(query: object = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface ExamSheetRow {
  studentId: string;
  rollNumber: string;
  name: string;
  marks: number | null;
}

export interface ExamSheet {
  examId: string;
  examName: string;
  subjectName?: string;
  maxMarks: number;
  rows: ExamSheetRow[];
  alreadyEntered: boolean;
}

export interface MyResult {
  id: string;
  examName: string;
  examDate: string;
  subjectName: string;
  marks: number;
  maxMarks: number;
  percentage: number;
  grade: string;
}

export const assessmentApi = {
  /* assignments */
  listAssignments: (query: ListQuery = {}) =>
    api.get<Paginated<Assignment>>(`/assignments${qs(query)}`),
  createAssignment: (input: {
    subjectId: string;
    title: string;
    description?: string;
    dueDate: string;
    maxMarks: number;
  }) => api.post<Assignment>("/assignments", input),
  removeAssignment: (id: string) => api.delete<{ message: string }>(`/assignments/${id}`),

  mySubmission: (assignmentId: string) =>
    api.get<Submission | null>(`/assignments/${assignmentId}/my-submission`),
  submit: (assignmentId: string, input: { content?: string; fileUrl?: string }) =>
    api.post<Submission>(`/assignments/${assignmentId}/submit`, input),
  submissions: (assignmentId: string) =>
    api.get<(Submission & { studentName?: string; maxMarks: number })[]>(
      `/assignments/${assignmentId}/submissions`,
    ),
  grade: (submissionId: string, input: { marks: number; feedback?: string }) =>
    api.patch<Submission>(`/submissions/${submissionId}/grade`, input),

  /* exams */
  listExams: (query: ListQuery = {}) => api.get<Paginated<Exam>>(`/exams${qs(query)}`),
  createExam: (input: {
    subjectId: string;
    name: string;
    examDate: string;
    maxMarks: number;
  }) => api.post<Exam>("/exams", input),
  removeExam: (id: string) => api.delete<{ message: string }>(`/exams/${id}`),
  examSheet: (id: string) => api.get<ExamSheet>(`/exams/${id}/sheet`),
  saveMarks: (id: string, entries: { studentId: string; marks: number }[]) =>
    api.post<{ marked: number }>(`/exams/${id}/marks`, { entries }),

  /* results */
  reportCard: (studentId: string) => api.get<ReportCard>(`/results/report-card/${studentId}`),
  myResults: () => api.get<MyResult[]>("/results/me"),
};
