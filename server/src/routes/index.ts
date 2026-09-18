import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { systemRouter } from "./system.routes.js";
import { validate } from "../middleware/validate.js";
import { protect, adminOnly, staffOnly } from "../middleware/auth.js";
import { catchAsync } from "../utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../utils/response.js";
import { actorFromRequest, listAuditLogs } from "../services/audit.service.js";
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
  auditListQuerySchema,
} from "../validators/academic.validator.js";
import { ApiError } from "../utils/ApiError.js";

export const apiRouter = Router();

/* ------------------------------------------------------------------ *
 * Feature routers
 * ------------------------------------------------------------------ */

apiRouter.use("/system", systemRouter);
apiRouter.use("/auth", authRouter);

/* ------------------------------------------------------------------ *
 * Terms — admin manages; everyone authenticated can read
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Classes — admin writes; staff reads
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Subjects — admin writes; staff and students read
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Students
 * ------------------------------------------------------------------ */

/** A student's own profile — must be declared BEFORE "/students/:id". */
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

/**
 * A student editing their OWN profile.
 * Guarded by `protect` only — NOT adminOnly, since this is self-service.
 * Safety comes from the schema: studentSelfUpdateSchema accepts only personal
 * contact fields, so academic fields (class, roll number, term) cannot be
 * changed through this route even if a client sends them.
 */
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

/* ------------------------------------------------------------------ *
 * Teachers
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Audit log — admin only
 * ------------------------------------------------------------------ */

apiRouter.get(
  "/audit",
  protect,
  adminOnly,
  validate(auditListQuerySchema, "query"),
  catchAsync(async (req, res) => {
    const { items, pagination } = await listAuditLogs(req.query as never);
    sendPaginated(res, items, pagination);
  }),
);
