import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env, isProd, isTest } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { csrfOriginCheck } from "./middleware/security.js";
import { sendSuccess } from "./utils/response.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy (Render/Vercel) so rate limiting and IPs are correct.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // ---- Security & parsing ----
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true, // required for the refresh-token cookie
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfOriginCheck(allowedOrigins));

  if (!isTest) app.use(morgan(isProd ? "combined" : "dev"));

  // ---- Rate limiting ----
  // Generous global limit; auth routes get a stricter one in their own router.
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: isProd ? 600 : 5000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, please slow down.", code: "RATE_LIMITED" },
    }),
  );

  // ---- Health check ----
  app.get("/health", (_req, res) => {
    sendSuccess(res, {
      status: "ok",
      uptime: Math.round(process.uptime()),
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // ---- API ----
  app.use("/api", apiRouter);

  // ---- Fallbacks (order matters: 404 then error) ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
