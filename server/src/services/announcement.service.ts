import { Announcement } from "../models/Announcement.js";
import { ClassSection } from "../models/ClassSection.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { Announcement as AnnouncementDTO, ListQuery, Role } from "@sms/shared";
import type {
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "../validators/attendance.validator.js";

/** Attaches author and class names in two queries rather than N. */
async function enrich(docs: AnnouncementDocumentLike[]): Promise<AnnouncementDTO[]> {
  const authorIds = [...new Set(docs.map((d) => String(d.authorId)))];
  const classIds = [...new Set(docs.map((d) => String(d.classSectionId ?? "")).filter(Boolean))];

  const [authors, classes] = await Promise.all([
    User.find({ _id: { $in: authorIds } }).select("firstName lastName").lean(),
    ClassSection.find({ _id: { $in: classIds } }).select("gradeLevel section").lean(),
  ]);

  const authorMap = new Map(
    authors.map((a) => [String(a._id), `${a.firstName} ${a.lastName}`.trim()]),
  );
  const classMap = new Map(
    classes.map((c) => [String(c._id), `${c.gradeLevel} ${c.section}`.trim()]),
  );

  return docs.map((d) => ({
    id: String(d._id),
    title: d.title,
    body: d.body,
    audienceRoles: (d.audienceRoles ?? []) as Role[],
    ...(d.classSectionId ? { classSectionId: String(d.classSectionId) } : {}),
    ...(d.classSectionId && classMap.get(String(d.classSectionId))
      ? { classSectionName: classMap.get(String(d.classSectionId))! }
      : {}),
    authorId: String(d.authorId),
    authorName: authorMap.get(String(d.authorId)) ?? "Unknown",
    requiresAcknowledgement: d.requiresAcknowledgement ?? false,
    acknowledgementCount: (d.acknowledgedBy ?? []).length,
    createdAt: (d.createdAt as Date).toISOString(),
  }));
}

interface AnnouncementDocumentLike {
  _id: unknown;
  title: string;
  body: string;
  audienceRoles?: string[];
  classSectionId?: unknown;
  authorId: unknown;
  requiresAcknowledgement?: boolean;
  acknowledgedBy?: unknown[];
  createdAt: Date;
}

/**
 * Announcements visible to a given user.
 *
 * Visibility rule:
 *   - An announcement with no target roles is visible to everyone.
 *   - Otherwise it is visible to users whose role is in the target list.
 *   - Staff (admin/teacher) see ALL announcements regardless of targeting.
 *
 * That last clause matters: without it an admin who publishes a
 * teacher-only notice cannot see their own post in the list, and would
 * reasonably conclude it vanished. It also lets staff manage notices aimed
 * at other audiences.
 *
 * A student additionally only sees notices for their own class (or school-wide).
 */
export async function listAnnouncements(
  query: ListQuery & { classSectionId?: string },
  viewer: { role: Role; classSectionId?: string },
) {
  const opts = buildListOptions(query, ["title", "createdAt"], "-createdAt");

  const isStaff = viewer.role === "admin" || viewer.role === "teacher";

  const filter: Record<string, unknown> = {
    isActive: true,
    ...searchFilter(query.search, ["title", "body"]),
  };

  if (!isStaff) {
    // Students only see what targets them.
    filter.$or = [{ audienceRoles: { $size: 0 } }, { audienceRoles: viewer.role }];
  }

  // A student only sees announcements for their own class (or school-wide ones).
  if (viewer.role === "student" && viewer.classSectionId) {
    filter.classSectionId = { $in: [viewer.classSectionId, null] };
  } else if (query.classSectionId) {
    filter.classSectionId = query.classSectionId;
  }

  const { docs, pagination } = await paginateModel<AnnouncementDocumentLike>(
    Announcement,
    filter,
    opts,
  );

  return { items: await enrich(docs), pagination };
}

export async function getAnnouncement(id: string): Promise<AnnouncementDTO> {
  const doc = await Announcement.findById(id).lean();
  if (!doc) throw ApiError.notFound("Announcement not found");
  const [dto] = await enrich([doc as unknown as AnnouncementDocumentLike]);
  return dto!;
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  actor: AuditActor & { id: string },
): Promise<AnnouncementDTO> {
  if (input.classSectionId) {
    const cls = await ClassSection.findById(input.classSectionId);
    if (!cls) throw ApiError.badRequest("The selected class does not exist");
  }

  const doc = await Announcement.create({
    title: input.title,
    body: input.body,
    audienceRoles: input.audienceRoles ?? [],
    classSectionId: input.classSectionId || undefined,
    authorId: actor.id,
    requiresAcknowledgement: input.requiresAcknowledgement ?? false,
  });

  await audit.created(actor, {
    resource: "Announcement",
    resourceId: String(doc._id),
    resourceLabel: doc.title,
  });

  return getAnnouncement(String(doc._id));
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
  actor: AuditActor,
): Promise<AnnouncementDTO> {
  const doc = await Announcement.findById(id);
  if (!doc) throw ApiError.notFound("Announcement not found");

  if (input.classSectionId) {
    const cls = await ClassSection.findById(input.classSectionId);
    if (!cls) throw ApiError.badRequest("The selected class does not exist");
  }

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.title !== undefined) doc.title = input.title;
  if (input.body !== undefined) doc.body = input.body;
  if (input.audienceRoles !== undefined) doc.audienceRoles = input.audienceRoles;
  if (input.classSectionId !== undefined) {
    doc.classSectionId = (input.classSectionId || undefined) as never;
  }
  if (input.requiresAcknowledgement !== undefined) {
    doc.requiresAcknowledgement = input.requiresAcknowledgement;
  }

  await doc.save();

  await audit.updated(
    actor,
    { resource: "Announcement", resourceId: String(doc._id), resourceLabel: doc.title },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return getAnnouncement(String(doc._id));
}

/** Soft delete — keeps the audit trail meaningful. */
export async function deleteAnnouncement(id: string, actor: AuditActor): Promise<void> {
  const doc = await Announcement.findById(id);
  if (!doc) throw ApiError.notFound("Announcement not found");

  doc.isActive = false;
  await doc.save();

  await audit.deleted(actor, {
    resource: "Announcement",
    resourceId: id,
    resourceLabel: doc.title,
  });
}

/** Records that the viewer has seen an announcement requiring acknowledgement. */
export async function acknowledge(
  id: string,
  userId: string,
): Promise<{ acknowledged: boolean; count: number }> {
  const doc = await Announcement.findById(id);
  if (!doc) throw ApiError.notFound("Announcement not found");
  if (!doc.requiresAcknowledgement) {
    throw ApiError.badRequest("This announcement does not require acknowledgement");
  }

  // $addToSet keeps it idempotent — acknowledging twice is not an error.
  await Announcement.updateOne({ _id: doc._id }, { $addToSet: { acknowledgedBy: userId } });

  const updated = await Announcement.findById(id).select("acknowledgedBy").lean();
  return { acknowledged: true, count: updated?.acknowledgedBy.length ?? 0 };
}
