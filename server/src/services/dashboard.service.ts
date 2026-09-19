import { Student } from "../models/Student.js";
import { Teacher } from "../models/Teacher.js";
import { ClassSection } from "../models/ClassSection.js";
import { Subject } from "../models/Subject.js";
import { Attendance, toDayStart } from "../models/Attendance.js";
import { FeeInvoice } from "../models/FeeInvoice.js";
import { AuditLog } from "../models/AuditLog.js";
import { buildReportCard } from "./assessment.service.js";
import { summarise } from "./attendance.service.js";
import { deriveStatus } from "./fee.service.js";
import type { AtRiskStudent, DashboardStats, Role } from "@sms/shared";

/** Thresholds that flag a student as at-risk. Kept explicit for clarity. */
const AT_RISK_ATTENDANCE = 75; // below this % attendance
const AT_RISK_GRADE = 50; // below this overall %

async function classNamesFor(ids: unknown[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.map((i) => String(i ?? "")).filter(Boolean))];
  const docs = await ClassSection.find({ _id: { $in: uniq } })
    .select("gradeLevel section")
    .lean();
  return new Map(docs.map((c) => [String(c._id), `${c.gradeLevel} ${c.section}`.trim()]));
}

/**
 * Flags students who are falling behind on attendance or grades.
 * Used by the dashboard and surfaced to staff so intervention is timely.
 */
async function findAtRiskStudents(
  scope: { classSectionId?: string; studentId?: string } = {},
): Promise<AtRiskStudent[]> {
  const studentFilter: Record<string, unknown> = { isActive: true };
  if (scope.classSectionId) studentFilter.classSectionId = scope.classSectionId;
  if (scope.studentId) studentFilter._id = scope.studentId;

  const students = await Student.find(studentFilter)
    .select("firstName lastName rollNumber classSectionId")
    .lean();

  const classNames = await classNamesFor(students.map((s) => s.classSectionId));

  const flagged: AtRiskStudent[] = [];

  for (const s of students) {
    const reasons: string[] = [];

    // Attendance percentage across all subjects.
    const records = await Attendance.find({ studentId: s._id }).select("status").lean();
    const att = summarise(String(s._id), records as { status: string }[]);

    let overall: number | undefined;
    try {
      const card = await buildReportCard(String(s._id));
      if (card.totalMax > 0) overall = card.overallPercentage;
    } catch {
      // No subjects/results yet — not grade-flagged.
    }

    if (att.total > 0 && att.percentage < AT_RISK_ATTENDANCE) {
      reasons.push(`Attendance ${att.percentage}% (below ${AT_RISK_ATTENDANCE}%)`);
    }
    if (overall !== undefined && overall < AT_RISK_GRADE) {
      reasons.push(`Overall grade ${overall}% (below ${AT_RISK_GRADE}%)`);
    }

    if (reasons.length === 0) continue;

    flagged.push({
      studentId: String(s._id),
      name: `${s.firstName} ${s.lastName}`.trim(),
      rollNumber: s.rollNumber,
      ...(s.classSectionId && classNames.get(String(s.classSectionId))
        ? { classSectionName: classNames.get(String(s.classSectionId))! }
        : {}),
      attendancePercentage: att.percentage,
      ...(overall !== undefined ? { overallPercentage: overall } : {}),
      reasons,
    });
  }

  // Most severe first (lowest attendance), then by name.
  flagged.sort((a, b) => a.attendancePercentage - b.attendancePercentage || a.name.localeCompare(b.name));
  return flagged;
}

/** The school-wide (or class-wide) attendance average. */
async function attendanceAverage(scope: { classSectionId?: string }): Promise<number> {
  const match: Record<string, unknown> = {};
  if (scope.classSectionId) {
    const ids = await Student.find({ classSectionId: scope.classSectionId, isActive: true })
      .select("_id")
      .lean();
    match.studentId = { $in: ids.map((s) => s._id) };
  }

  const rows = await Attendance.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r._id] = r.count;
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  if (total === 0) return 0;
  const attended = (counts.present ?? 0) + (counts.late ?? 0);
  return Math.round((attended / total) * 1000) / 10;
}

/** Collected vs outstanding, plus the number of unpaid/overdue invoices. */
async function feeSummary(): Promise<{ collected: number; outstanding: number; unpaidInvoices: number }> {
  const invoices = await FeeInvoice.find({ isActive: true }).lean();
  let collected = 0;
  let outstanding = 0;
  let unpaidInvoices = 0;

  for (const inv of invoices) {
    const paid = (inv.payments ?? []).reduce((n: number, p) => n + p.amount, 0);
    collected += paid;
    const status = deriveStatus(inv.amount, paid, inv.dueDate as Date);
    outstanding += Math.max(0, inv.amount - paid);
    if (status === "unpaid" || status === "overdue") unpaidInvoices += 1;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return { collected: round(collected), outstanding: round(outstanding), unpaidInvoices };
}

/**
 * Builds the role-scoped dashboard.
 *
 * - Admin: school-wide counts, all fees, all at-risk students.
 * - Teacher: counts limited to their own classes, at-risk for those classes.
 * - Student: only their own at-risk flag and their own invoices.
 */
export async function getDashboard(actor: { role: Role; id: string }): Promise<DashboardStats> {
  const scope: { classSectionId?: string; studentId?: string } = {};

  // Resolve the viewer's scope.
  if (actor.role === "teacher") {
    const classes = await ClassSection.find({ classTeacherId: actor.id }).select("_id").lean();
    if (classes.length > 0) scope.classSectionId = String(classes[0]!._id);
    // A teacher with no class assignment still sees global counts.
  } else if (actor.role === "student") {
    const own = await Student.findOne({ userId: actor.id }).select("_id classSectionId").lean();
    if (own) scope.studentId = String(own._id);
  }

  const countsFilter: Record<string, unknown> = { isActive: true };
  if (scope.classSectionId) countsFilter.classSectionId = scope.classSectionId;

  const [students, teachers, classes, subjects, attendance, fees, atRisk, activity] =
    await Promise.all([
      Student.countDocuments(countsFilter),
      Teacher.countDocuments({ isActive: true }),
      ClassSection.countDocuments({ isActive: true }),
      Subject.countDocuments({ isActive: true }),
      attendanceAverage(scope),
      feeSummary(),
      findAtRiskStudents(scope),
      AuditLog.find().sort({ at: -1 }).limit(8).select("resource resourceLabel action at actorEmail").lean(),
    ]);

  return {
    counts: { students, teachers, classes, subjects },
    attendance: {
      average: attendance,
      todayMarked: await Attendance.countDocuments({ date: toDayStart(new Date()) }),
    },
    fees,
    atRisk,
    recentActivity: activity.map((a) => ({
      resource: a.resource,
      ...(a.resourceLabel ? { resourceLabel: a.resourceLabel } : {}),
      action: a.action,
      at: (a.at as Date).toISOString(),
      actorEmail: a.actorEmail ?? "system",
    })),
  };
}
