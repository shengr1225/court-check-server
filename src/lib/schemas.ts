import { z } from "zod";

export const SingleTableItemSchema = z.object({
  pk: z.string(),
  sk: z.string(),
});

export const CourtStatusSchema = z.enum(["EMPTY", "LOW", "MEDIUM", "CROWDED"]);

const CourtFieldsSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine: z.string(),
  lat: z.number().optional(),
  long: z.number().optional(),
  courtCount: z.number().int().positive().optional(),
  status: CourtStatusSchema,
  lastUpdatedAt: z.string().datetime(),
  photoUrl: z.string().url(),
});

export const CourtSchema = CourtFieldsSchema;

export const CourtEntitySchema = SingleTableItemSchema.extend({
  EntityType: z.literal("COURT"),
  PK: z.literal("COURT"),
  SK: z.string().regex(/^COURT#/, "Must start with COURT#"),
}).merge(CourtFieldsSchema);

const CheckinFieldsSchema = z.object({
  checkinId: z.string(),
  courtId: z.string(),
  userId: z.string(),
  userName: z.string().optional(),
  status: CourtStatusSchema,
  createdAt: z.string().datetime(),
  photoUrl: z.string().url().optional(),
});

export const CheckinSchema = CheckinFieldsSchema;

export const CheckinEntitySchema = SingleTableItemSchema.extend({
  EntityType: z.literal("CHECKIN"),
  PK: z.string().regex(/^COURT#/, "Must start with COURT#"),
  SK: z.string().regex(/^CHECKIN#/, "Must start with CHECKIN#"),
}).merge(CheckinFieldsSchema);

export const UserEmailEntitySchema = SingleTableItemSchema.extend({
  EntityType: z.literal("USER_EMAIL"),
  PK: z.string().regex(/^EMAIL#/, "Must start with EMAIL#"),
  SK: z.literal("USER"),
  userId: z.string(),
  email: z.string().email(),
});

export const UserProfileSchema = SingleTableItemSchema.extend({
  EntityType: z.literal("USER_PROFILE"),
  PK: z.string().regex(/^USER#/, "Must start with USER#"),
  SK: z.literal("PROFILE"),
  userId: z.string(),
  name: z.string(),
  checkinCount: z.number().int().nonnegative().optional(),
  stripeCustomerId: z.string().optional(),
});

export type UserEmailEntity = z.infer<typeof UserEmailEntitySchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;

export type CourtStatus = z.infer<typeof CourtStatusSchema>;
export type Court = z.infer<typeof CourtSchema>;
export type CourtEntity = z.infer<typeof CourtEntitySchema>;
export type Checkin = z.infer<typeof CheckinSchema>;
export type CheckinEntity = z.infer<typeof CheckinEntitySchema>;
