import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
} from "../validators/auth.validator.js";
import { isProd } from "../config/env.js";

export const authRouter = Router();

/** Credential endpoints get a much tighter limit than the global one. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    code: "RATE_LIMITED",
  },
});

authRouter.post("/register", authLimiter, validate(registerSchema), authController.register);
authRouter.post("/login", authLimiter, validate(loginSchema), authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", protect, authController.logout);

authRouter.get("/me", protect, authController.me);
authRouter.patch("/me", protect, validate(updateProfileSchema), authController.updateMe);
authRouter.post(
  "/change-password",
  protect,
  validate(changePasswordSchema),
  authController.changePassword,
);
