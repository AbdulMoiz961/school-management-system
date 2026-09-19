import type {
  Announcement,
  AttendanceRecord,
  AttendanceRegisterInput,
  AttendanceRegisterView,
  AttendanceSummary,
  ConflictCheckResult,
  ListQuery,
  Paginated,
  TimetableSlotView,
  Weekday,
  AnnouncementInput,
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

/* ---------------------------------------------------------------- attendance */

export const attendanceApi = {
  /** The marking screen's payload: every enrolled student, pre-filled. */
  register: (subjectId: string, date: string) =>
    api.get<AttendanceRegisterView>(`/attendance/register${qs({ subjectId, date })}`),

  /** Mark or re-mark the whole register in one request. */
  mark: (input: AttendanceRegisterInput) =>
    api.post<{ marked: number; created: number; updated: number }>("/attendance/register", input),

  summary: (studentId: string, filters: { from?: string; to?: string; subjectId?: string } = {}) =>
    api.get<AttendanceSummary>(`/attendance/summary/${studentId}${qs(filters)}`),

  classSummaries: (classSectionId: string, filters: { from?: string; to?: string } = {}) =>
    api.get<AttendanceSummary[]>(`/attendance/class/${classSectionId}${qs(filters)}`),

  history: (
    query: ListQuery & { studentId?: string; subjectId?: string; from?: string; to?: string },
  ) => api.get<Paginated<AttendanceRecord>>(`/attendance/history${qs(query)}`),
};

/* ----------------------------------------------------------------- timetable */

export const timetableApi = {
  /** Slots for a class, or the caller's own schedule when omitted. */
  list: (query: { classSectionId?: string; day?: Weekday } = {}) =>
    api.get<TimetableSlotView[]>(`/timetable${qs(query)}`),

  /** Pre-flight check so the UI can warn before attempting a save. */
  check: (input: {
    classSectionId: string;
    teacherId: string;
    day: Weekday;
    startTime: string;
    endTime: string;
    excludeSlotId?: string;
  }) => api.post<ConflictCheckResult>("/timetable/check", input),

  create: (input: {
    classSectionId: string;
    subjectId: string;
    teacherId: string;
    day: Weekday;
    startTime: string;
    endTime: string;
  }) => api.post<TimetableSlotView>("/timetable", input),

  update: (
    id: string,
    input: Partial<{
      classSectionId: string;
      subjectId: string;
      teacherId: string;
      day: Weekday;
      startTime: string;
      endTime: string;
    }>,
  ) => api.patch<TimetableSlotView>(`/timetable/${id}`, input),

  remove: (id: string) => api.delete<{ message: string }>(`/timetable/${id}`),
};

/* ------------------------------------------------------------- announcements */

export const announcementsApi = {
  list: (query: ListQuery & { classSectionId?: string } = {}) =>
    api.get<Paginated<Announcement>>(`/announcements${qs(query)}`),
  get: (id: string) => api.get<Announcement>(`/announcements/${id}`),
  create: (input: AnnouncementInput) => api.post<Announcement>("/announcements", input),
  update: (id: string, input: Partial<AnnouncementInput>) =>
    api.patch<Announcement>(`/announcements/${id}`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/announcements/${id}`),
  acknowledge: (id: string) =>
    api.post<{ acknowledged: boolean; count: number }>(`/announcements/${id}/acknowledge`),
};

export type { TimetableSlotView, AttendanceRegisterView, AttendanceSummary, Announcement };
