import { Assignment, type AssignmentDocument } from "../models/Assignment.js";
import { Submission, type SubmissionDocument } from "../models/Submission.js";
import { Exam, type ExamDocument } from "../models/Exam.js";
import { ExamMark } from "../models/ExamMark.js";
import { Student } from "../models/Student.js";
import { Subject } from "../models/Subject.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import { gradeFor, pct, type ListQuery, type ReportCard, type SubjectResult } from "@sms/shared";

/* ------------------------------------------------------------------ helpers */

function toAssignment(doc: AssignmentDocument, subjectName?: string) {
  return {
    id: String(doc._id),
    subjectId: String(doc.subjectId),
    ...(subjectName ? { subjectName } : {}),
    title: doc.title,
    description: doc.description,
    dueDate: doc.dueDate.toISOString(),
    maxMarks: doc.maxMarks,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt.toISOString(),
  };
}

function toSubmission(doc: SubmissionDocument, studentName?: string) {
  return {
    id: String(doc._id),
    assignmentId: String(doc.assignmentId),
    studentId: String(doc.studentId),
    ...(studentName ? { studentName } : {}),
    ...(doc.content ? { content: doc.content } : {}),
    ...(doc.fileUrl ? { fileUrl: doc.fileUrl } : {}),
    submittedAt: doc.submittedAt.toISOString(),
    isLate: doc.isLate,
    ...(doc.marks !== undefined ? { marks: doc.marks } : {}),
    ...(doc.feedback ? { feedback: doc.feedback } : {}),
    ...(doc.gradedBy ? { gradedBy: String(doc.gradedBy) } : {}),
    ...(doc.gradedAt ? { gradedAt: doc.gradedAt.toISOString() } : {}),
  };
}

function toExam(doc: ExamDocument, subjectName?: string) {
  return {
    id: String(doc._id),
    subjectId: String(doc.subjectId),
    ...(subjectName ? { subjectName } : {}),
    name: doc.name,
    examDate: doc.examDate.toISOString(),
    maxMarks: doc.maxMarks,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Batch-resolves subject names so lists don't fire N queries. */
async function subjectNames(ids: unknown[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((i) => String(i ?? "")).filter(Boolean))];
  const docs = await Subject.find({ _id: { $in: uniq } }).select("name code").lean();
  return new Map(docs.map((s) => [String(s._id), `${s.code} — ${s.name}`]));
}

/* -------------------------------------------------------------- assignments */

export async function listAssignments(query: ListQuery, filter: { subjectIds?: string[] } = {}) {
  const opts = buildListOptions(query, ["title", "dueDate", "createdAt"], "-dueDate");
  const filterDoc: Record<string, unknown> = {
    isActive: true,
    ...searchFilter(query.search, ["title", "description"]),
  };
  if (query.includeInactive) delete filterDoc.isActive;
  // Teachers only see assignments for their own subjects.
  if (filter.subjectIds) filterDoc.subjectId = { $in: filter.subjectIds };

  const { docs, pagination } = await paginateModel<AssignmentDocument>(Assignment, filterDoc, opts);
  const names = await subjectNames(docs.map((d) => d.subjectId));
  return {
    items: docs.map((d) => toAssignment(d, names.get(String(d.subjectId)))),
    pagination,
  };
}

export async function createAssignment(
  input: {
    subjectId: string;
    title: string;
    description?: string;
    dueDate: string;
    maxMarks: number;
  },
  actor: AuditActor & { id: string },
) {
  const subject = await Subject.findById(input.subjectId);
  if (!subject) throw ApiError.badRequest("The selected subject does not exist");

  const doc = await Assignment.create({
    subjectId: input.subjectId,
    title: input.title,
    description: input.description ?? "",
    dueDate: new Date(input.dueDate),
    maxMarks: input.maxMarks,
    createdBy: actor.id,
  });

  await audit.created(actor, {
    resource: "Assignment",
    resourceId: String(doc._id),
    resourceLabel: doc.title,
  });

  return toAssignment(doc, `${subject.code} — ${subject.name}`);
}

export async function deleteAssignment(id: string, actor: AuditActor) {
  const doc = await Assignment.findById(id);
  if (!doc) throw ApiError.notFound("Assignment not found");
  doc.isActive = false;
  await doc.save();
  await audit.deleted(actor, {
    resource: "Assignment",
    resourceId: id,
    resourceLabel: doc.title,
  });
}

/* -------------------------------------------------------------- submissions */

/** A student's own submission, or nothing if they haven't submitted yet. */
export async function getMySubmission(assignmentId: string, studentId: string) {
  const doc = await Submission.findOne({ assignmentId, studentId });
  return doc ? toSubmission(doc) : null;
}

/** Submissions for an assignment — the teacher's grading queue. */
export async function listSubmissions(assignmentId: string) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw ApiError.notFound("Assignment not found");

  const docs = await Submission.find({ assignmentId }).lean();
  const studentIds = docs.map((d) => d.studentId);
  const students = await Student.find({ _id: { $in: studentIds } })
    .select("firstName lastName rollNumber")
    .lean();
  const names = new Map(
    students.map((s) => [String(s._id), `${s.firstName} ${s.lastName}`.trim()]),
  );

  return docs.map((d) => {
    const doc = d as unknown as SubmissionDocument;
    return {
      ...toSubmission(doc, names.get(String(d.studentId))),
      maxMarks: assignment.maxMarks,
    };
  });
}

/**
 * Submit (or re-submit) work for an assignment.
 *
 * `isLate` is decided here against the assignment's due date. The client never
 * sends it — otherwise a student could simply claim to be on time.
 */
export async function submitAssignment(
  input: { assignmentId: string; content?: string; fileUrl?: string },
  studentId: string,
) {
  const assignment = await Assignment.findById(input.assignmentId);
  if (!assignment) throw ApiError.notFound("Assignment not found");
  if (!assignment.isActive) throw ApiError.badRequest("This assignment is no longer accepting work");

  if (!input.content?.trim() && !input.fileUrl?.trim()) {
    throw ApiError.badRequest("Provide either written content or a link to your work");
  }

  const now = new Date();
  const isLate = now > assignment.dueDate;

  const existing = await Submission.findOne({
    assignmentId: input.assignmentId,
    studentId,
  });

  if (existing) {
    // Re-submission after grading would invalidate the marks, so refuse it.
    if (existing.marks !== undefined) {
      throw ApiError.badRequest("This submission has already been graded and cannot be changed");
    }
    existing.content = input.content;
    existing.fileUrl = input.fileUrl;
    existing.submittedAt = now;
    existing.isLate = isLate;
    await existing.save();
    return toSubmission(existing);
  }

  const doc = await Submission.create({
    assignmentId: input.assignmentId,
    studentId,
    content: input.content,
    fileUrl: input.fileUrl,
    submittedAt: now,
    isLate,
  });
  return toSubmission(doc);
}

export async function gradeSubmission(
  submissionId: string,
  input: { marks: number; feedback?: string },
  actor: AuditActor & { id: string },
) {
  const doc = await Submission.findById(submissionId);
  if (!doc) throw ApiError.notFound("Submission not found");

  const assignment = await Assignment.findById(doc.assignmentId);
  if (!assignment) throw ApiError.notFound("Assignment not found");

  // Marks can't exceed the assignment's ceiling — the schema can't know that.
  if (input.marks > assignment.maxMarks) {
    throw ApiError.badRequest(`Marks cannot exceed the assignment maximum of ${assignment.maxMarks}`);
  }

  doc.marks = input.marks;
  doc.feedback = input.feedback;
  doc.gradedBy = actor.id as never;
  doc.gradedAt = new Date();
  await doc.save();

  await audit.updated(
    actor,
    {
      resource: "Submission",
      resourceId: String(doc._id),
      resourceLabel: `${assignment.title} — ${input.marks}/${assignment.maxMarks}`,
    },
    {},
    { marks: input.marks },
  );

  return toSubmission(doc);
}

/* -------------------------------------------------------------------- exams */

export async function listExams(query: ListQuery, filter: { subjectIds?: string[] } = {}) {
  const opts = buildListOptions(query, ["name", "examDate", "createdAt"], "-examDate");
  const filterDoc: Record<string, unknown> = {
    isActive: true,
    ...searchFilter(query.search, ["name"]),
  };
  if (query.includeInactive) delete filterDoc.isActive;
  if (filter.subjectIds) filterDoc.subjectId = { $in: filter.subjectIds };

  const { docs, pagination } = await paginateModel<ExamDocument>(Exam, filterDoc, opts);
  const names = await subjectNames(docs.map((d) => d.subjectId));
  return { items: docs.map((d) => toExam(d, names.get(String(d.subjectId)))), pagination };
}

export async function createExam(
  input: { subjectId: string; name: string; examDate: string; maxMarks: number },
  actor: AuditActor & { id: string },
) {
  const subject = await Subject.findById(input.subjectId);
  if (!subject) throw ApiError.badRequest("The selected subject does not exist");

  const doc = await Exam.create({
    subjectId: input.subjectId,
    name: input.name,
    examDate: new Date(input.examDate),
    maxMarks: input.maxMarks,
    createdBy: actor.id,
  });

  await audit.created(actor, {
    resource: "Exam",
    resourceId: String(doc._id),
    resourceLabel: doc.name,
  });

  return toExam(doc, `${subject.code} — ${subject.name}`);
}

export async function deleteExam(id: string, actor: AuditActor) {
  const doc = await Exam.findById(id);
  if (!doc) throw ApiError.notFound("Exam not found");
  doc.isActive = false;
  await doc.save();
  await ExamMark.deleteMany({ examId: id });
  await audit.deleted(actor, { resource: "Exam", resourceId: id, resourceLabel: doc.name });
}

/**
 * Marks-entry sheet for an exam: every enrolled student plus any existing mark.
 * Mirrors the attendance register so the same "load then save" pattern works.
 */
export async function getExamSheet(examId: string) {
  const exam = await Exam.findById(examId);
  if (!exam) throw ApiError.notFound("Exam not found");

  const subject = await Subject.findById(exam.subjectId).select("name code classSectionId").lean();
  const students = subject?.classSectionId
    ? await Student.find({ classSectionId: subject.classSectionId, isActive: true })
        .sort({ lastName: 1, firstName: 1 })
        .select("rollNumber firstName lastName")
        .lean()
    : [];

  const marks = await ExamMark.find({ examId }).lean();
  const byStudent = new Map(marks.map((m) => [String(m.studentId), m.marks]));

  return {
    examId,
    examName: exam.name,
    maxMarks: exam.maxMarks,
    ...(subject ? { subjectName: `${subject.code} — ${subject.name}` } : {}),
    rows: students.map((s) => ({
      studentId: String(s._id),
      rollNumber: s.rollNumber,
      name: `${s.firstName} ${s.lastName}`.trim(),
      marks: byStudent.get(String(s._id)) ?? null,
    })),
    alreadyEntered: marks.length > 0,
  };
}

/** Bulk upsert of exam marks, validated against the exam's maximum. */
export async function saveExamMarks(
  examId: string,
  entries: { studentId: string; marks: number }[],
  actor: AuditActor & { id: string },
) {
  const exam = await Exam.findById(examId);
  if (!exam) throw ApiError.notFound("Exam not found");

  const over = entries.filter((e) => e.marks > exam.maxMarks);
  if (over.length > 0) {
    throw ApiError.badRequest(`Marks cannot exceed the exam maximum of ${exam.maxMarks}`);
  }

  const subject = await Subject.findById(exam.subjectId).select("classSectionId").lean();
  if (subject?.classSectionId) {
    const enrolled = await Student.find({
      _id: { $in: entries.map((e) => e.studentId) },
      classSectionId: subject.classSectionId,
      isActive: true,
    }).select("_id");
    const valid = new Set(enrolled.map((s) => String(s._id)));
    const invalid = entries.filter((e) => !valid.has(e.studentId));
    if (invalid.length > 0) {
      throw ApiError.badRequest(`${invalid.length} student(s) are not enrolled in this subject's class`);
    }
  }

  const ops: Parameters<typeof ExamMark.bulkWrite>[0] = entries.map((e) => ({
    updateOne: {
      filter: { examId, studentId: e.studentId },
      update: { $set: { marks: e.marks, enteredBy: actor.id } },
      upsert: true,
    },
  }));

  const res = await ExamMark.bulkWrite(ops, { ordered: false });

  await audit.created(actor, {
    resource: "ExamMark",
    resourceId: examId,
    resourceLabel: `${exam.name} — ${entries.length} marks`,
  });

  return { marked: entries.length, created: res.upsertedCount, updated: res.modifiedCount };
}

/* -------------------------------------------------------------- report card */

/**
 * Builds a student's report card by combining exam marks and graded
 * assignments per subject.
 *
 * Only subjects the student's class actually takes are included, so the card
 * reflects their curriculum rather than every subject in the school.
 */
export async function buildReportCard(studentId: string): Promise<ReportCard> {
  const student = await Student.findById(studentId).lean();
  if (!student) throw ApiError.notFound("Student not found");

  const subjects = student.classSectionId
    ? await Subject.find({ classSectionId: student.classSectionId, isActive: true })
        .select("name code")
        .lean()
    : [];
  const subjectIds = subjects.map((s) => s._id);

  const [exams, marks, assignments, submissions] = await Promise.all([
    Exam.find({ subjectId: { $in: subjectIds }, isActive: true }).select("subjectId maxMarks").lean(),
    ExamMark.find({ studentId }).lean(),
    Assignment.find({ subjectId: { $in: subjectIds }, isActive: true })
      .select("subjectId maxMarks")
      .lean(),
    Submission.find({ studentId, marks: { $ne: undefined } }).select("assignmentId marks").lean(),
  ]);

  const examById = new Map(exams.map((e) => [String(e._id), e]));
  const assignmentById = new Map(assignments.map((a) => [String(a._id), a]));

  // Accumulate obtained/max per subject from both sources.
  const totals = new Map<string, { obtained: number; max: number }>();
  const add = (subjectId: string, obtained: number, max: number) => {
    const cur = totals.get(subjectId) ?? { obtained: 0, max: 0 };
    cur.obtained += obtained;
    cur.max += max;
    totals.set(subjectId, cur);
  };

  for (const m of marks) {
    const exam = examById.get(String(m.examId));
    if (exam) add(String(exam.subjectId), m.marks, exam.maxMarks);
  }
  for (const s of submissions) {
    const assignment = assignmentById.get(String(s.assignmentId));
    if (assignment && s.marks !== undefined) {
      add(String(assignment.subjectId), s.marks, assignment.maxMarks);
    }
  }

  const results: SubjectResult[] = subjects
    .filter((s) => totals.has(String(s._id)))
    .map((s) => {
      const t = totals.get(String(s._id))!;
      const percentage = pct(t.obtained, t.max);
      return {
        subjectId: String(s._id),
        subjectName: `${s.code} — ${s.name}`,
        obtained: t.obtained,
        max: t.max,
        percentage,
        grade: gradeFor(percentage),
      };
    });

  const totalObtained = results.reduce((n, r) => n + r.obtained, 0);
  const totalMax = results.reduce((n, r) => n + r.max, 0);
  const overallPercentage = pct(totalObtained, totalMax);

  return {
    studentId,
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    subjects: results,
    totalObtained,
    totalMax,
    overallPercentage,
    overallGrade: gradeFor(overallPercentage),
  };
}

/** A student's own published results: exam marks per subject. */
export async function myResults(studentId: string) {
  const [marks, exams, subjects] = await Promise.all([
    ExamMark.find({ studentId }).lean(),
    Exam.find({ isActive: true }).select("name subjectId maxMarks examDate").lean(),
    Subject.find({}).select("name code").lean(),
  ]);

  const examById = new Map(exams.map((e) => [String(e._id), e]));
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));

  return marks
    .map((m) => {
      const exam = examById.get(String(m.examId));
      if (!exam) return null;
      const subject = subjectById.get(String(exam.subjectId));
      const percentage = pct(m.marks, exam.maxMarks);
      return {
        id: String(m._id),
        examName: exam.name,
        examDate: (exam.examDate as Date).toISOString(),
        subjectName: subject ? `${subject.code} — ${subject.name}` : "Subject",
        marks: m.marks,
        maxMarks: exam.maxMarks,
        percentage,
        grade: gradeFor(percentage),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.examDate.localeCompare(a.examDate));
}

export { toSubmission };
