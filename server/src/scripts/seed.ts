/**
 * Seeds a coherent demo dataset so the app is immediately explorable.
 *
 *   npm run seed
 *
 * Idempotent — re-running updates and skips rather than duplicating.
 *
 * Creates:
 *   - 3 logins            admin / teacher / student @scholaris.dev
 *   - 1 academic term     the current term
 *   - 1 class section     with the demo teacher assigned
 *   - 2 subjects          assigned to the class and teacher
 *   - 1 student profile   LINKED to the demo student login
 *   - 1 teacher profile   LINKED to the demo teacher login
 *
 * The linking matters: an earlier version created the logins but no profiles,
 * so the seeded student hit "No student profile is linked to this account".
 */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { User } from "../models/User.js";
import { Teacher } from "../models/Teacher.js";
import { Student } from "../models/Student.js";
import { Term } from "../models/Term.js";
import { ClassSection } from "../models/ClassSection.js";
import { Subject } from "../models/Subject.js";

const DEMO_PASSWORD = "Password123";

const ACCOUNTS = [
  { email: "admin@scholaris.dev", firstName: "Ayesha", lastName: "Khan", role: "admin" as const },
  { email: "teacher@scholaris.dev", firstName: "Bilal", lastName: "Ahmed", role: "teacher" as const },
  { email: "student@scholaris.dev", firstName: "Hamza", lastName: "Raza", role: "student" as const },
];

/** Creates or refreshes a login, always ensuring the password is known. */
async function upsertUser(a: (typeof ACCOUNTS)[number]) {
  const existing = await User.findOne({ email: a.email }).select("+password");
  if (existing) {
    existing.password = DEMO_PASSWORD; // re-hashed by the pre-save hook
    existing.firstName = a.firstName;
    existing.lastName = a.lastName;
    existing.role = a.role;
    existing.isActive = true;
    await existing.save();
    console.log(`  ↻ login    ${a.role.padEnd(7)} ${a.email}`);
    return existing;
  }
  const created = await User.create({ ...a, password: DEMO_PASSWORD });
  console.log(`  ✓ login    ${a.role.padEnd(7)} ${a.email}`);
  return created;
}

async function main() {
  console.log("\n▸ Seeding demo data…");
  await connectDatabase();

  // ---- Logins ----
  console.log("\n  Accounts");
  const users = new Map<string, Awaited<ReturnType<typeof upsertUser>>>();
  for (const a of ACCOUNTS) users.set(a.role, await upsertUser(a));

  const teacherUser = users.get("teacher")!;
  const studentUser = users.get("student")!;

  // ---- Academic term ----
  console.log("\n  Academic");
  const year = new Date().getFullYear();
  let term = await Term.findOne({ name: `Fall ${year}` });
  if (!term) {
    term = await Term.create({
      name: `Fall ${year}`,
      academicYear: `${year}-${year + 1}`,
      startDate: new Date(`${year}-09-01`),
      endDate: new Date(`${year}-12-20`),
      status: "active",
      isCurrent: true,
    });
    console.log(`  ✓ term     ${term.name} (${term.academicYear}) — current`);
  } else {
    term.status = "active";
    term.isCurrent = true;
    await term.save();
    console.log(`  ↻ term     ${term.name} (${term.academicYear}) — current`);
  }

  // ---- Teacher profile, linked to the teacher login ----
  let teacher = await Teacher.findOne({ userId: teacherUser._id });
  if (!teacher) {
    const count = await Teacher.countDocuments();
    teacher = await Teacher.create({
      userId: teacherUser._id,
      employeeId: `EMP-${String(count + 1).padStart(4, "0")}`,
      firstName: teacherUser.firstName,
      lastName: teacherUser.lastName,
      email: teacherUser.email,
      phone: "+92 300 1112222",
      subjectCodes: ["MATH-10", "PHY-10"],
    });
    console.log(`  ✓ teacher  ${teacher.employeeId} ${teacher.firstName} ${teacher.lastName}`);
  } else {
    console.log(`  ↻ teacher  ${teacher.employeeId} ${teacher.firstName} ${teacher.lastName}`);
  }

  // ---- Class section ----
  let klass = await ClassSection.findOne({ gradeLevel: "Grade 10", section: "A" });
  if (!klass) {
    klass = await ClassSection.create({
      gradeLevel: "Grade 10",
      section: "A",
      capacity: 30,
      classTeacherId: teacherUser._id,
      termId: term._id,
    });
    console.log(`  ✓ class    ${klass.gradeLevel} ${klass.section} (cap ${klass.capacity})`);
  } else {
    klass.classTeacherId = teacherUser._id as never;
    klass.termId = term._id as never;
    await klass.save();
    console.log(`  ↻ class    ${klass.gradeLevel} ${klass.section} (cap ${klass.capacity})`);
  }

  // ---- Subjects ----
  const SUBJECTS = [
    { name: "Mathematics", code: "MATH-10", creditHours: 4 },
    { name: "Physics", code: "PHY-10", creditHours: 3 },
  ];
  for (const s of SUBJECTS) {
    const exists = await Subject.findOne({ code: s.code, termId: term._id });
    if (exists) {
      console.log(`  ↻ subject  ${s.code} ${s.name}`);
      continue;
    }
    await Subject.create({
      ...s,
      classSectionId: klass._id,
      teacherId: teacherUser._id,
      termId: term._id,
    });
    console.log(`  ✓ subject  ${s.code} ${s.name}`);
  }

  // ---- Student profile, linked to the student login ----
  let student = await Student.findOne({ userId: studentUser._id });
  if (!student) {
    student = await Student.create({
      userId: studentUser._id,
      rollNumber: `STU-${year}-0001`,
      firstName: studentUser.firstName,
      lastName: studentUser.lastName,
      email: studentUser.email,
      dateOfBirth: new Date(`${year - 16}-04-12`),
      guardianName: "Raza Ali",
      guardianPhone: "+92 300 9998888",
      phone: "+92 301 2223333",
      address: "House 12, Street 4, Lahore",
      classSectionId: klass._id,
      termId: term._id,
    });
    console.log(`  ✓ student  ${student.rollNumber} ${student.firstName} ${student.lastName}`);
  } else {
    student.classSectionId = klass._id as never;
    student.termId = term._id as never;
    await student.save();
    console.log(`  ↻ student  ${student.rollNumber} ${student.firstName} ${student.lastName}`);
  }

  // ---- Summary ----
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Demo logins — password: ${DEMO_PASSWORD}

    admin@scholaris.dev     full access
    teacher@scholaris.dev   their classes & students
    student@scholaris.dev   own profile, linked ✓

  Seeded: 1 current term · 1 class · 2 subjects ·
          1 teacher profile · 1 student profile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✖ Seed failed:", err);
    process.exit(1);
  });
