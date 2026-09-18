import { Term, type TermDocument } from "../models/Term.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { AcademicTerm, ListQuery } from "@sms/shared";
import type { z } from "zod";
import type { createTermSchema, updateTermSchema } from "../validators/academic.validator.js";

type CreateInput = z.infer<typeof createTermSchema>;
type UpdateInput = z.infer<typeof updateTermSchema>;

export const TERM_SORT_FIELDS = ["name", "startDate", "endDate", "status", "createdAt"] as const;

export function toTerm(doc: TermDocument): AcademicTerm {
  return {
    id: String(doc._id),
    name: doc.name,
    academicYear: doc.academicYear,
    startDate: doc.startDate.toISOString(),
    endDate: doc.endDate.toISOString(),
    status: doc.status,
    isCurrent: doc.isCurrent,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function listTerms(query: ListQuery) {
  const opts = buildListOptions(query, TERM_SORT_FIELDS, "-startDate");
  const filter = { ...searchFilter(query.search, ["name", "academicYear"]) };

  const { docs, pagination } = await paginateModel<TermDocument>(Term, filter, opts);
  return { items: docs.map(toTerm), pagination };
}

export async function getTerm(id: string): Promise<AcademicTerm> {
  const doc = await Term.findById(id);
  if (!doc) throw ApiError.notFound("Term not found");
  return toTerm(doc);
}

/** The single term flagged current, if any. Used to default new records. */
export async function getCurrentTerm(): Promise<AcademicTerm | null> {
  const doc = await Term.findOne({ isCurrent: true });
  return doc ? toTerm(doc) : null;
}

export async function createTerm(input: CreateInput, actor: AuditActor): Promise<AcademicTerm> {
  const clash = await Term.findOne({ name: input.name, academicYear: input.academicYear });
  if (clash) {
    throw ApiError.conflict(`A term named "${input.name}" already exists for ${input.academicYear}`);
  }

  const doc = await Term.create({
    name: input.name,
    academicYear: input.academicYear,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    ...(input.status ? { status: input.status } : {}),
    isCurrent: input.isCurrent ?? false,
  });

  await audit.created(actor, {
    resource: "Term",
    resourceId: String(doc._id),
    resourceLabel: `${doc.name} (${doc.academicYear})`,
  });

  return toTerm(doc);
}

export async function updateTerm(
  id: string,
  input: UpdateInput,
  actor: AuditActor,
): Promise<AcademicTerm> {
  const doc = await Term.findById(id);
  if (!doc) throw ApiError.notFound("Term not found");

  // Capture the pre-change state for the audit diff.
  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.name || input.academicYear) {
    const name = input.name ?? doc.name;
    const year = input.academicYear ?? doc.academicYear;
    const clash = await Term.findOne({ name, academicYear: year, _id: { $ne: doc._id } });
    if (clash) throw ApiError.conflict(`A term named "${name}" already exists for ${year}`);
  }

  if (input.name !== undefined) doc.name = input.name;
  if (input.academicYear !== undefined) doc.academicYear = input.academicYear;
  if (input.startDate !== undefined) doc.startDate = new Date(input.startDate);
  if (input.endDate !== undefined) doc.endDate = new Date(input.endDate);
  if (input.status !== undefined) doc.status = input.status;
  // The pre-save hook clears isCurrent on every other term when set true.
  if (input.isCurrent !== undefined) doc.isCurrent = input.isCurrent;

  await doc.save();

  await audit.updated(
    actor,
    { resource: "Term", resourceId: String(doc._id), resourceLabel: `${doc.name} (${doc.academicYear})` },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return toTerm(doc);
}

export async function deleteTerm(id: string, actor: AuditActor): Promise<void> {
  const doc = await Term.findById(id);
  if (!doc) throw ApiError.notFound("Term not found");

  // Refuse rather than cascade — silently detaching classes from their term
  // would corrupt historical data.
  const { ClassSection } = await import("../models/ClassSection.js");
  const inUse = await ClassSection.countDocuments({ termId: doc._id });
  if (inUse > 0) {
    throw ApiError.badRequest(
      `Cannot delete this term: ${inUse} class${inUse === 1 ? "" : "es"} still reference it. ` +
        `Reassign or deactivate them first.`,
    );
  }

  const { Subject } = await import("../models/Subject.js");
  const subjectsUsing = await Subject.countDocuments({ termId: doc._id });
  if (subjectsUsing > 0) {
    throw ApiError.badRequest(
      `Cannot delete this term: ${subjectsUsing} subject${subjectsUsing === 1 ? "" : "s"} still reference it.`,
    );
  }

  await doc.deleteOne();
  await audit.deleted(actor, {
    resource: "Term",
    resourceId: id,
    resourceLabel: `${doc.name} (${doc.academicYear})`,
  });
}
