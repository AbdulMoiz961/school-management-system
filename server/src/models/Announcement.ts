import { Schema, model, type HydratedDocument } from "mongoose";
import { ROLES, type Role } from "@sms/shared";

export interface IAnnouncement {
  title: string;
  body: string;
  /** Empty array = visible to every role. */
  audienceRoles: Role[];
  classSectionId?: Schema.Types.ObjectId;
  authorId: Schema.Types.ObjectId;
  requiresAcknowledgement: boolean;
  /** User ids who have acknowledged. Empty when acknowledgement isn't required. */
  acknowledgedBy: Schema.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AnnouncementDocument = HydratedDocument<IAnnouncement>;

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 140 },
    body: { type: String, required: [true, "Body is required"], trim: true, maxlength: 5000 },
    audienceRoles: {
      type: [String],
      enum: { values: [...ROLES], message: "Invalid role in audience: {VALUE}" },
      default: [],
    },
    classSectionId: { type: Schema.Types.ObjectId, ref: "ClassSection", default: undefined },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requiresAcknowledgement: { type: Boolean, default: false },
    acknowledgedBy: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The listing query filters on these, newest first.
announcementSchema.index({ isActive: 1, createdAt: -1 });
announcementSchema.index({ audienceRoles: 1 });

export const Announcement = model<IAnnouncement>("Announcement", announcementSchema);
