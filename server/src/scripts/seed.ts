/**
 * Seed script — creates demo accounts so anyone (including a reviewer) can
 * log in and explore the system immediately.
 *
 *   npm run seed           (from the repo root: npm run seed)
 *
 * Safe to re-run: existing demo users are updated rather than duplicated.
 */
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { User } from "../models/User.js";

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "admin" | "teacher" | "student";
}

const DEMO_PASSWORD = "Password123";

const USERS: SeedUser[] = [
  {
    email: "admin@scholaris.dev",
    password: DEMO_PASSWORD,
    firstName: "Ayesha",
    lastName: "Khan",
    role: "admin",
  },
  {
    email: "teacher@scholaris.dev",
    password: DEMO_PASSWORD,
    firstName: "Bilal",
    lastName: "Ahmed",
    role: "teacher",
  },
  {
    email: "student@scholaris.dev",
    password: DEMO_PASSWORD,
    firstName: "Hamza",
    lastName: "Raza",
    role: "student",
  },
];

async function seed(): Promise<void> {
  console.log("\n▸ Seeding demo data…");
  await connectDatabase();

  for (const u of USERS) {
    const existing = await User.findOne({ email: u.email }).select("+password");

    if (existing) {
      // Refresh the password + role so re-running always yields working logins.
      existing.password = u.password;
      existing.firstName = u.firstName;
      existing.lastName = u.lastName;
      existing.role = u.role;
      existing.isActive = true;
      await existing.save();
      console.log(`  ↻ updated ${u.role.padEnd(7)} ${u.email}`);
    } else {
      await User.create(u);
      console.log(`  ✓ created ${u.role.padEnd(7)} ${u.email}`);
    }
  }

  console.log(`\n  All demo accounts use the password: ${DEMO_PASSWORD}\n`);
  await disconnectDatabase();
}

seed()
  .then(() => {
    console.log("▸ Seed complete.\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("✖ Seed failed:", err);
    process.exit(1);
  });
