/**
 * Removes fixtures created by scripts/api-verify.sh and scripts/ui-verify.py.
 *
 *   npm run clean:test
 *
 * Only touches data whose identifying fields carry the known test prefixes:
 *   - terms named        VP-<stamp> / Verify <stamp>
 *   - classes            gradeLevel "Verify <stamp>"
 *   - subjects           code VP-<stamp>
 *   - students/teachers  email *-<stamp>@scholaris.dev or *.test@scholaris.dev
 *
 * The three seeded demo accounts are never touched.
 */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Term } from "../models/Term.js";
import { ClassSection } from "../models/ClassSection.js";
import { Subject } from "../models/Subject.js";
import { Student } from "../models/Student.js";
import { Teacher } from "../models/Teacher.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";

const TERM_PATTERN = /^(VP-\d+|Verify \d+)$/;
const STUDENT_EMAIL_PATTERN = /^(vp|vp2|sara)-\d+@scholaris\.dev$/;
const TEACHER_EMAIL_PATTERN = /^vt-\d+@scholaris\.dev$/;
const GENERIC_TEST_EMAIL = /\.(test|example)@|@example\.com$/;

const KEEP = ["admin@scholaris.dev", "teacher@scholaris.dev", "student@scholaris.dev"];

async function main() {
  console.log("\n▸ Cleaning verification fixtures…");
  await connectDatabase();

  // Order matters: children before parents, so no dangling references.
  const subjects = await Subject.deleteMany({ code: /^VP-\d+$/ });
  console.log(`  subjects removed  ${subjects.deletedCount}`);

  const students = await Student.deleteMany({
    $or: [{ email: STUDENT_EMAIL_PATTERN }, { email: GENERIC_TEST_EMAIL }],
  });
  console.log(`  students removed  ${students.deletedCount}`);

  const teachers = await Teacher.deleteMany({
    $or: [{ email: TEACHER_EMAIL_PATTERN }, { email: GENERIC_TEST_EMAIL }],
  });
  console.log(`  teachers removed  ${teachers.deletedCount}`);

  const classes = await ClassSection.deleteMany({ gradeLevel: /^Verify \d+$/ });
  console.log(`  classes removed   ${classes.deletedCount}`);

  const terms = await Term.deleteMany({ name: TERM_PATTERN });
  console.log(`  terms removed     ${terms.deletedCount}`);

  // Test logins, keeping the seeded demo accounts.
  const users = await User.deleteMany({
    email: { $nin: KEEP },
    $or: [{ email: STUDENT_EMAIL_PATTERN }, { email: TEACHER_EMAIL_PATTERN }, { email: GENERIC_TEST_EMAIL }],
  });
  console.log(`  logins removed    ${users.deletedCount}`);

  // Audit rows referencing the removed fixtures.
  const logs = await AuditLog.deleteMany({
    $or: [{ resourceLabel: TERM_PATTERN }, { resourceLabel: /^STU-.*Verify/ }],
  });
  console.log(`  audit rows removed ${logs.deletedCount}`);

  console.log("\n  Remaining:");
  const remainingUsers = await User.find({}).select("email role").lean();
  for (const u of remainingUsers) {
    console.log(`    ${String(u.role ?? "?").padEnd(8)} ${u.email ?? "(no email)"}`);
  }
  console.log(
    `\n  counts → terms:${await Term.countDocuments()} classes:${await ClassSection.countDocuments()} ` +
      `subjects:${await Subject.countDocuments()} students:${await Student.countDocuments()} ` +
      `teachers:${await Teacher.countDocuments()}\n`,
  );

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✖ Clean failed:", err);
    process.exit(1);
  });
