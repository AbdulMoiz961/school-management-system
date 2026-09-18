import { AuditLog, computeDiff, type AuditAction } from "../models/AuditLog.js";
import { paginateModel, buildListOptions, searchFilter } from "../utils/query.js";
import type { Request } from "express";
import type { ListQuery } from "@sms/shared";

export interface AuditActor {
  id?: string;
  email: string;
}

export interface AuditContext {
  resource: string;
  resourceId: string;
  resourceLabel?: string;
}

/** Derives the acting user from the request. Falls back to "system" for scripts. */
export function actorFromRequest(req: Request): AuditActor {
  if (req.user) return { id: req.user.id, email: req.user.email };
  return { email: "system" };
}

/**
 * Records an audit entry. Deliberately fire-and-forget-safe: a failure to write
 * history must never fail the user's actual operation, so errors are logged and
 * swallowed rather than rethrown.
 */
async function record(
  actor: AuditActor,
  action: AuditAction,
  ctx: AuditContext,
  changes?: Record<string, { from: unknown; to: unknown }>,
): Promise<void> {
  try {
    await AuditLog.create({
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      resource: ctx.resource,
      resourceId: ctx.resourceId,
      resourceLabel: ctx.resourceLabel,
      changes,
    });
  } catch (err) {
    console.error("✖ Failed to write audit log:", err);
  }
}

export const audit = {
  /** Records a creation. */
  async created(actor: AuditActor, ctx: AuditContext): Promise<void> {
    await record(actor, "create", ctx);
  },

  /**
   * Records an update — but only if something actually changed.
   * `before`/`after` should be plain objects (use `.toObject()` on documents).
   */
  async updated(
    actor: AuditActor,
    ctx: AuditContext,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    const changes = computeDiff(before, after);
    if (!changes) return; // no-op update, don't pollute the log
    await record(actor, "update", ctx, changes);
  },

  /** Records a deletion (soft or hard). */
  async deleted(actor: AuditActor, ctx: AuditContext): Promise<void> {
    await record(actor, "delete", ctx);
  },
};

export const AUDIT_SORT_FIELDS = ["at", "resource", "action", "actorEmail"] as const;

/** Paginated audit log query, admin-facing. */
export async function listAuditLogs(query: ListQuery & { resource?: string; action?: AuditAction }) {
  const opts = buildListOptions(query, AUDIT_SORT_FIELDS, "-at");

  const filter: Record<string, unknown> = {
    ...searchFilter(query.search, ["actorEmail", "resource", "resourceLabel", "resourceId"]),
  };
  if (query.resource) filter.resource = query.resource;
  if (query.action) filter.action = query.action;

  const { docs, pagination } = await paginateModel<import("../models/AuditLog.js").AuditLogDocument>(
    AuditLog,
    filter,
    opts,
  );
  const items = docs.map((d) => {
    const { _id, __v, ...rest } = d.toObject() as unknown as Record<string, unknown>;
    return { id: String(_id), ...rest } as unknown as import("@sms/shared").AuditLogEntry;
  });
  return { items, pagination };
}

/** History for one specific record. */
export async function listAuditForResource(resource: string, resourceId: string) {
  const docs = await AuditLog.find({ resource, resourceId }).sort({ at: -1 }).limit(100).lean().exec();
  return docs.map((d) => {
    const { _id, __v, ...rest } = d as unknown as Record<string, unknown>;
    return { id: String(_id), ...rest } as unknown as import("@sms/shared").AuditLogEntry;
  });
}
