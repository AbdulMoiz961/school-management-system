import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES, type Role } from "@sms/shared";

export interface IUser {
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  isActive: boolean;
  /** Incremented on logout / password change to invalidate issued refresh tokens. */
  refreshTokenVersion: number;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never returned by default — must be explicitly requested
    },
    role: {
      type: String,
      enum: { values: [...ROLES], message: "Invalid role: {VALUE}" },
      required: true,
      index: true,
    },
    firstName: { type: String, required: [true, "First name is required"], trim: true, maxlength: 60 },
    lastName: { type: String, required: [true, "Last name is required"], trim: true, maxlength: 60 },
    avatarUrl: { type: String, default: undefined },
    isActive: { type: Boolean, default: true },
    refreshTokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: undefined },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.password; // belt-and-braces: schema already excludes it
        return ret;
      },
    },
  },
);

userSchema.virtual("fullName").get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`.trim();
});

/** Hash on create and on any password change. */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.method("comparePassword", function (this: UserDocument, candidate: string) {
  return bcrypt.compare(candidate, this.password);
});

export const User = model<IUser, UserModel>("User", userSchema);
