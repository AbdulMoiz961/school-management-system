import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { systemRouter } from "./system.routes.js";

/**
 * Central API router. Every feature router is mounted here.
 * Order matters only for overlapping paths — none currently overlap.
 */
export const apiRouter = Router();

apiRouter.use("/system", systemRouter);
apiRouter.use("/auth", authRouter);
