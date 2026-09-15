import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { registerProcessHandlers } from "./middleware/errorHandler.js";

async function bootstrap(): Promise<void> {
  registerProcessHandlers();

  console.log(`\n▸ Starting SMS API (${env.NODE_ENV})…`);
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`  ✓ API listening on http://localhost:${env.PORT}`);
    console.log(`  ✓ Health check:        http://localhost:${env.PORT}/health\n`);
  });

  /** Drain connections before exiting so in-flight requests finish. */
  const shutdown = async (signal: string) => {
    console.log(`\n▸ ${signal} received — shutting down gracefully…`);
    server.close(async () => {
      await disconnectDatabase();
      console.log("  ✓ Closed HTTP server and MongoDB connection");
      process.exit(0);
    });
    // Force-exit if graceful close hangs.
    setTimeout(() => {
      console.error("  ✖ Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("✖ Failed to start server:", err);
  process.exit(1);
});
