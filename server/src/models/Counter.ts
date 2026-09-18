import { Schema, model, type Model } from "mongoose";

/**
 * Atomic counter used to generate sequential human-readable identifiers
 * (STU-2026-0001, EMP-0007, …).
 *
 * Why not `countDocuments() + 1`? Two concurrent creates would read the same
 * count and collide. `findOneAndUpdate` with `$inc` is a single atomic document
 * operation in MongoDB, so each caller gets a distinct value.
 */
interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter: Model<ICounter> = model<ICounter>("Counter", counterSchema);

/**
 * Returns the next integer for a named counter, starting at 1.
 *
 *   await nextSequence("student:2026")  // 1, then 2, then 3…
 */
export async function nextSequence(key: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return doc!.seq;
}

/** `STU-2026-0001` — zero-padded to 4 digits, widening naturally past 9999. */
export async function nextStudentRollNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextSequence(`student:${year}`);
  return `STU-${year}-${String(seq).padStart(4, "0")}`;
}

/** `EMP-0001` */
export async function nextEmployeeId(): Promise<string> {
  const seq = await nextSequence("teacher");
  return `EMP-${String(seq).padStart(4, "0")}`;
}
