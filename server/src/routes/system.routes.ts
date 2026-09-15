import { Router } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/response.js";
import { mongoose } from "../config/db.js";
import { ROLES } from "@sms/shared";

export const systemRouter = Router();

/** Liveness + DB readiness. Useful for uptime monitors and the dashboard footer. */
systemRouter.get(
  "/status",
  catchAsync(async (_req, res) => {
    // mongoose.connection.readyState is a number (0–3); map it to a label.
    const states: Record<number, string> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const dbState = states[mongoose.connection.readyState] ?? "unknown";

    sendSuccess(res, {
      database: {
        state: dbState,
        name: mongoose.connection.name ?? null,
        host: mongoose.connection.host ?? null,
      },
      roles: ROLES,
      timestamp: new Date().toISOString(),
    });
  }),
);

/** Introspection of the mounted API surface — handy while building. */
systemRouter.get(
  "/routes",
  catchAsync(async (_req, res) => {
    sendSuccess(res, {
      mounted: ["/api/system", "/api/auth"],
      planned: [
        "/api/students",
        "/api/teachers",
        "/api/classes",
        "/api/subjects",
        "/api/attendance",
        "/api/timetable",
        "/api/assignments",
        "/api/exams",
        "/api/fees",
        "/api/announcements",
        "/api/audit",
      ],
    });
  }),
);
