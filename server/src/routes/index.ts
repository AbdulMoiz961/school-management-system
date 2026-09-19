import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { systemRouter } from "./system.routes.js";
import { validate } from "../middleware/validate.js";
import { protect, adminOnly, staffOnly } from "../middleware/auth.js";
import { catchAsync } from "../utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../utils/response.js";
import { actorFromRequest, listAuditLogs } from "../services/audit.service.js";
import { ApiError } from "../utils/ApiError.js";

import {
  listTerms,
  getTerm,
  getCurrentTerm,
  createTerm,
  updateTerm,
  deleteTerm,
} from "../services/term.service.js";
import {
  listClasses,
  getClassSection,
  createClassSection,
  updateClassSection,
  deleteClassSection,
} from "../services/class.service.js";
import {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
} from "../services/subject.service.js";
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudentAsAdmin,
  updateOwnStudentProfile,
  deactivateStudent,
  getStudentForSelf,
} from "../services/student.service.js";
import {
  listTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  deactivateTeacher,
  getTeacherForSelf,
} from "../services/teacher.service.js";
import {
  getRegister,
  markRegister,
  getSummary,
  getClassSummaries,
  listHistory,
} from "../services/attendance.service.js";
import {
  checkConflicts,
  createSlot,
  updateSlot,
  deleteSlot,
  listSlotsForClass,
  listSlotsForTeacher,
} from "../services/timetable.service.js";
import {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  acknowledge,
} from "../services/announcement.service.js";
import {
  listQuerySchema,
  createTermSchema,
  updateTermSchema,
  createClassSchema,
  updateClassSchema,
  createSubjectSchema,
  updateSubjectSchema,
  createStudentSchema,
  studentAdminUpdateSchema,
  studentSelfUpdateSchema,
  createTeacherSchema,
  updateTeacherSchema,
} from "../validators/academic.validator.js";
import {
  markRegisterSchema,
  attendanceSummaryQuerySchema,
  studentHistoryQuerySchema,
  createSlotSchema,
  updateSlotSchema,
  conflictCheckSchema,
  timetableQuerySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  announcementQuerySchema,
} from "../validators/attendance.validator.js";

export const apiRouter = Router();

/* ---------------------------------------------------------------- feature routers */
apiRouter.use("/system", systemRouter);
apiRouter.use("/auth", authRouter);

/* ---------------------------------------------------------------- terms */
apiRouter.get(
  "/terms",
  protect,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listTerms(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/terms/current",
  protect,
  catchAsync(async (_req, res) => {
    sendSuccess(res, await getCurrentTerm());
  }),
);

apiRouter.get(
  "/terms/:id",
  protect,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getTerm(String(req.params.id)));
  }),
);

apiRouter.post(
  "/terms",
  protect,
  adminOnly,
  validate(createTermSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createTerm(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/terms/:id",
  protect,
  adminOnly,
  validate(updateTermSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateTerm(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/terms/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deleteTerm(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Term deleted" });
  }),
);

/* ---------------------------------------------------------------- classes */
apiRouter.get(
  "/classes",
  protect,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listClasses(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/classes/:id",
  protect,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getClassSection(String(req.params.id)));
  }),
);

apiRouter.post(
  "/classes",
  protect,
  adminOnly,
  validate(createClassSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createClassSection(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/classes/:id",
  protect,
  adminOnly,
  validate(updateClassSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateClassSection(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/classes/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deleteClassSection(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Class deleted" });
  }),
);

/* ---------------------------------------------------------------- subjects */
apiRouter.get(
  "/subjects",
  protect,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listSubjects(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/subjects/:id",
  protect,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getSubject(String(req.params.id)));
  }),
);

apiRouter.post(
  "/subjects",
  protect,
  adminOnly,
  validate(createSubjectSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createSubject(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/subjects/:id",
  protect,
  adminOnly,
  validate(updateSubjectSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateSubject(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/subjects/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deleteSubject(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Subject deleted" });
  }),
);

/* ---------------------------------------------------------------- students */
apiRouter.get(
  "/students/me",
  protect,
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== "student") {
      throw ApiError.forbidden("Only student accounts have a student profile");
    }
    sendSuccess(res, await getStudentForSelf(req.user.id));
  }),
);

/** Own-profile edit. The schema accepts only contact fields, so academic
 *  fields cannot be changed even if a client sends them. */
apiRouter.patch(
  "/students/me",
  protect,
  validate(studentSelfUpdateSchema),
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== "student") {
      throw ApiError.forbidden("Only student accounts have a student profile");
    }
    sendSuccess(res, await updateOwnStudentProfile(req.user.id, req.body, actorFromRequest(req)));
  }),
);

apiRouter.get(
  "/students",
  protect,
  staffOnly,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listStudents(req.query as never, req.user!);
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/students/:id",
  protect,
  staffOnly,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getStudent(String(req.params.id)));
  }),
);

apiRouter.post(
  "/students",
  protect,
  adminOnly,
  validate(createStudentSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createStudent(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/students/:id",
  protect,
  adminOnly,
  validate(studentAdminUpdateSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateStudentAsAdmin(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/students/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deactivateStudent(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Student deactivated" });
  }),
);

/* ---------------------------------------------------------------- teachers */
apiRouter.get(
  "/teachers/me",
  protect,
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.user.role !== "teacher") {
      throw ApiError.forbidden("Only teacher accounts have a teacher profile");
    }
    sendSuccess(res, await getTeacherForSelf(req.user.id));
  }),
);

apiRouter.get(
  "/teachers",
  protect,
  adminOnly,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listTeachers(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/teachers/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getTeacher(String(req.params.id)));
  }),
);

apiRouter.post(
  "/teachers",
  protect,
  adminOnly,
  validate(createTeacherSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createTeacher(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/teachers/:id",
  protect,
  adminOnly,
  validate(updateTeacherSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateTeacher(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/teachers/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deactivateTeacher(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Teacher deactivated" });
  }),
);

/* ================================================================ PHASE 4 */

/* ---------------------------------------------------------------- attendance */

/** The marking screen's data: every enrolled student, pre-filled. */
apiRouter.get(
  "/attendance/register",
  protect,
  staffOnly,
  catchAsync(async (req, res) => {
    const subjectId = String(req.query.subjectId ?? "");
    const date = String(req.query.date ?? "");
    if (!subjectId || !date) {
      throw ApiError.badRequest("subjectId and date are required");
    }
    sendSuccess(res, await getRegister(subjectId, date));
  }),
);

/** Mark or re-mark a whole register in one call. */
apiRouter.post(
  "/attendance/register",
  protect,
  staffOnly,
  validate(markRegisterSchema),
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await markRegister(req.body, {
      ...actorFromRequest(req),
      role: req.user.role,
      id: req.user.id,
    });
    sendSuccess(res, result, 201);
  }),
);

/** A single student's attendance percentage. */
apiRouter.get(
  "/attendance/summary/:studentId",
  protect,
  catchAsync(async (req, res) => {
    const studentId = String(req.params.studentId);
    // A student may only read their own summary.
    if (req.user?.role === "student") {
      const own = await getStudentForSelf(req.user.id);
      if (own.id !== studentId) {
        throw ApiError.forbidden("You can only view your own attendance");
      }
    }
    const q = attendanceSummaryQuerySchema.parse(req.query);
    sendSuccess(res, await getSummary(studentId, q));
  }),
);

/** Summaries for every student in a class. */
apiRouter.get(
  "/attendance/class/:classSectionId",
  protect,
  staffOnly,
  catchAsync(async (req, res) => {
    const q = attendanceSummaryQuerySchema.parse(req.query);
    sendSuccess(res, await getClassSummaries(String(req.params.classSectionId), q));
  }),
);

/** Raw history with pagination — used by the student's calendar view. */
apiRouter.get(
  "/attendance/history",
  protect,
  validate(studentHistoryQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const q = req.query as never as {
      studentId?: string;
      subjectId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    };
    // Students see only their own history.
    if (req.user?.role === "student") {
      const own = await getStudentForSelf(req.user.id);
      q.studentId = own.id;
    }
    const { items, pagination } = await listHistory(q);
    sendPaginated(res, items, pagination);
  }),
);

/* ---------------------------------------------------------------- timetable */

/** Pre-flight conflict check so the UI can warn before saving. */
apiRouter.post(
  "/timetable/check",
  protect,
  staffOnly,
  validate(conflictCheckSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await checkConflicts(req.body));
  }),
);

apiRouter.get(
  "/timetable",
  protect,
  validate(timetableQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { classSectionId, day } = req.query as { classSectionId?: string; day?: never };
    if (classSectionId) {
      sendSuccess(res, await listSlotsForClass(classSectionId, day));
      return;
    }
    // No class given: a teacher sees their own schedule, others need a class.
    if (req.user?.role === "teacher") {
      sendSuccess(res, await listSlotsForTeacher(req.user.id, day));
      return;
    }
    if (req.user?.role === "student") {
      const own = await getStudentForSelf(req.user.id);
      if (!own.classSectionId) {
        sendSuccess(res, []);
        return;
      }
      sendSuccess(res, await listSlotsForClass(own.classSectionId, day));
      return;
    }
    throw ApiError.badRequest("classSectionId is required");
  }),
);

apiRouter.post(
  "/timetable",
  protect,
  adminOnly,
  validate(createSlotSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await createSlot(req.body, actorFromRequest(req)), 201);
  }),
);

apiRouter.patch(
  "/timetable/:id",
  protect,
  adminOnly,
  validate(updateSlotSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateSlot(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/timetable/:id",
  protect,
  adminOnly,
  catchAsync(async (req, res) => {
    await deleteSlot(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Slot removed" });
  }),
);

/* ---------------------------------------------------------------- announcements */

apiRouter.get(
  "/announcements",
  protect,
  validate(announcementQuerySchema, "query"),
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();

    // Resolve the viewer's class so a student sees their class's notices.
    let classSectionId: string | undefined;
    if (req.user.role === "student") {
      const own = await getStudentForSelf(req.user.id);
      classSectionId = own.classSectionId;
    }

    const { items, pagination } = await listAnnouncements(req.query as never, {
      role: req.user.role,
      ...(classSectionId ? { classSectionId } : {}),
    });
    sendPaginated(res, items, pagination);
  }),
);

apiRouter.get(
  "/announcements/:id",
  protect,
  catchAsync(async (req, res) => {
    sendSuccess(res, await getAnnouncement(String(req.params.id)));
  }),
);

apiRouter.post(
  "/announcements",
  protect,
  staffOnly,
  validate(createAnnouncementSchema),
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    sendSuccess(
      res,
      await createAnnouncement(req.body, { ...actorFromRequest(req), id: req.user.id }),
      201,
    );
  }),
);

apiRouter.patch(
  "/announcements/:id",
  protect,
  staffOnly,
  validate(updateAnnouncementSchema),
  catchAsync(async (req, res) => {
    sendSuccess(res, await updateAnnouncement(String(req.params.id), req.body, actorFromRequest(req)));
  }),
);

apiRouter.delete(
  "/announcements/:id",
  protect,
  staffOnly,
  catchAsync(async (req, res) => {
    await deleteAnnouncement(String(req.params.id), actorFromRequest(req));
    sendSuccess(res, { message: "Announcement removed" });
  }),
);

apiRouter.post(
  "/announcements/:id/acknowledge",
  protect,
  catchAsync(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    sendSuccess(res, await acknowledge(String(req.params.id), req.user.id));
  }),
);

/* ---------------------------------------------------------------- audit */
apiRouter.get(
  "/audit",
  protect,
  adminOnly,
  validate(listQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listAuditLogs(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);

/* ------------------------------------------------------------------ */
