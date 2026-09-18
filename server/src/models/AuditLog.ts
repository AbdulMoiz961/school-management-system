import { Schema, model, type HydratedDocument, type Model } from "mongoose";

export type AuditAction = "create" | "update" | "delete";

export interface IAuditLog {
  /** Undefined when the actor's account was later removed. */
  actorId?: string;
  /** Stored denormalised so the entry stays readable after a user is deleted. */
  actorEmail: string;
  action: AuditAction;
  /** Entity type, e.g. "Student". */
  resource: string;
  resourceId: string;
  /** Human-readable label captured at write time (e.g. the student's roll number). */
  resourceLabel?: string;
  /** Field-level diff — only present for updates. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  at: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    actorEmail: { type: String, required: true },
    action: { type: String, enum: ["create", "update", "delete"], required: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    resourceLabel: { type: String, default: undefined },
    changes: { type: Schema.Types.Mixed, default: undefined },
    at: { type: Date, default: () => new Date(), index: true },
  },
  {
    // Audit entries are immutable — no updatedAt.
    timestamps: { createdAt: false, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Supports the common "what happened to this record" and "recent activity" queries.
auditLogSchema.index({ resource: 1, resourceId: 1, at: -1 });
auditLogSchema.index({ at: -1 });

/**
 * Audit rows must never be edited or removed through normal application code.
 * These hooks make accidental mutation a hard error rather than a silent change.
 */
auditLogSchema.pre("findOneAndUpdate", function (next) {
  next(new Error("Audit log entries are immutable"));
});
auditLogSchema.pre("updateOne", function (next) {
  next(new Error("Audit log entries are immutable"));
});
auditLogSchema.pre("deleteOne", function (next) {
  next(new Error("Audit log entries are immutable"));
});

export const AuditLog: Model<IAuditLog> = model<IAuditLog>("AuditLog", auditLogSchema);

/**
 * Fields that should never appear in a stored diff, even as a `from`/`to` pair.
 * Passwords would otherwise be recorded in plaintext-adjacent form.
 */
const REDACTED_FIELDS = new Set([
  "password",
  "refreshTokenVersion",
  "avatarUrl",
  "__v",
  "updatedAt",
]);

export interface DiffInput {
  [key: string]: unknown;
}

/**
 * Computes a shallow field-level diff between two objects.
 * Returns undefined when nothing meaningful changed, so we don't write empty
 * audit rows for no-op updates.
 */
export function computeDiff(
  before: DiffInput,
  after: DiffInput,
): Record<string, { from: unknown; to: unknown }> | undefined {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (REDACTED_FIELDS.has(key)) continue;

    const from = before[key];
    const to = after[key];
    if (sameValue(from, to)) continue;

    changes[key] = { from, to };
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

/** Compares values, treating Date and ObjectId instances by their serialised form. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Dates
  if (a instanceof Date || b instanceof Date) {
    const da = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const db = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    return da === db;
  }

  // ObjectIds (and anything else with a stable toString)
  if (typeof a === "object" && typeof b === "object") {
    return String(a) === String(b);
  }

  return false;
}
