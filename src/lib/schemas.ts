import { z } from "zod";

export const SingleTableItemSchema = z.object({
  pk: z.string(),
  sk: z.string(),
});

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
});

export type UserEmailEntity = z.infer<typeof UserEmailEntitySchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
