import mongoose from "mongoose";
import { env, isProd } from "./env.js";

mongoose.set("strictQuery", true);

/** Connect to MongoDB. Retries with backoff so a slow Atlas cold start doesn't kill boot. */
export async function connectDatabase(retries = 5): Promise<typeof mongoose> {
  const options: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
    autoIndex: !isProd, // don't build indexes automatically in prod
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!isProd) {
        mongoose.connection.on("connected", () => console.log("  ✓ MongoDB connected"));
        mongoose.connection.on("disconnected", () => console.warn("  ! MongoDB disconnected"));
        mongoose.connection.on("error", (e) => console.error("  ✖ MongoDB error:", e.message));
      }
      const conn = await mongoose.connect(env.MONGODB_URI, options);
      return conn;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const last = attempt === retries;
      console.error(`  MongoDB connection attempt ${attempt}/${retries} failed: ${msg}`);
      if (last) throw error;
      const wait = Math.min(2000 * 2 ** (attempt - 1), 15000);
      console.log(`  retrying in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}

/** Close the connection cleanly so the process can exit. */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}

export { mongoose };
