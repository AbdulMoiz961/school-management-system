import { Subject } from "../models/Subject.js";
import type { Request } from "express";
import type { Role } from "@sms/shared";

/**
 * Subject ids a teacher is allowed to manage (assignments, exams, marks).
 * Admins are unrestricted, so they get `undefined`.
 */
export async function teacherSubjectIds(req: Request): Promise<string[] | undefined> {
  const user = req.user as { id: string; role: Role } | undefined;
  if (!user || user.role !== "teacher") return undefined;
  const subjects = await Subject.find({ teacherId: user.id }).select("_id").lean();
  return subjects.map((s) => String(s._id));
}

/** Guards a single-subject write: teachers may only touch their own. */
export async function assertOwnsSubject(
  req: Request,
  subjectId: string,
): Promise<void> {
  const ids = await teacherSubjectIds(req);
  if (ids && !ids.includes(subjectId)) {
    const { ApiError } = await import("../utils/ApiError.js");
    throw ApiError.forbidden("You can only manage assessments for subjects you teach");
  }
}
