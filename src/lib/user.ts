import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDoc } from "@/lib/aws";
import { UserEmailEntity, UserProfile } from "@/lib/schemas";
import crypto from "node:crypto";

export function generateUserId(): string {
  return crypto.randomUUID();
}

export async function getUserByEmail(
  tableName: string,
  email: string
): Promise<UserEmailEntity | null> {
  const pk = `EMAIL#${email}`;
  const sk = "USER";

  const res = await ddbDoc().send(
    new GetCommand({
      TableName: tableName,
      Key: { pk, sk },
    })
  );

  if (!res.Item) return null;

  return res.Item as UserEmailEntity;
}

export async function getUserProfile(
  tableName: string,
  userId: string
): Promise<UserProfile | null> {
  const pk = `USER#${userId}`;
  const sk = "PROFILE";

  const res = await ddbDoc().send(
    new GetCommand({
      TableName: tableName,
      Key: { pk, sk },
    })
  );

  if (!res.Item) return null;

  return res.Item as UserProfile;
}

export async function createUser(
  tableName: string,
  email: string,
  name: string
): Promise<{
  userId: string;
  userEmail: UserEmailEntity;
  userProfile: UserProfile;
}> {
  const userId = generateUserId();
  const nowIso = new Date().toISOString();

  const userEmail: UserEmailEntity = {
    EntityType: "USER_EMAIL",
    PK: `EMAIL#${email}`,
    SK: "USER",
    pk: `EMAIL#${email}`,
    sk: "USER",
    userId,
    email,
  };

  const userProfile: UserProfile = {
    EntityType: "USER_PROFILE",
    PK: `USER#${userId}`,
    SK: "PROFILE",
    pk: `USER#${userId}`,
    sk: "PROFILE",
    userId,
    name,
  };

  await ddbDoc().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: userEmail,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: userProfile,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      ],
    })
  );

  return { userId, userEmail, userProfile };
}
