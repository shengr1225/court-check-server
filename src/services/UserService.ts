import { ddbGet, ddbTransactWrite, ddbUpdate } from "@/services/dynamodb";
import { UserEmailEntity, UserProfile } from "@/lib/schemas";
import crypto from "node:crypto";

export const UserService = {
  generateUserId(): string {
    return crypto.randomUUID();
  },

  async getUserEmailByEmail(params: {
    tableName: string;
    email: string;
  }): Promise<UserEmailEntity | null> {
    const pk = `EMAIL#${params.email}`;
    const sk = "USER";
    const item = await ddbGet<UserEmailEntity>({
      tableName: params.tableName,
      key: { pk, sk },
    });
    return item ?? null;
  },

  async getUserProfileByUserId(params: {
    tableName: string;
    userId: string;
  }): Promise<UserProfile | null> {
    const pk = `USER#${params.userId}`;
    const sk = "PROFILE";
    const item = await ddbGet<UserProfile>({
      tableName: params.tableName,
      key: { pk, sk },
    });
    return item ?? null;
  },

  async createUser(params: {
    tableName: string;
    userId: string;
    email: string;
    name: string;
  }): Promise<{ userEmail: UserEmailEntity; userProfile: UserProfile }> {
    const userEmail: UserEmailEntity = {
      EntityType: "USER_EMAIL",
      PK: `EMAIL#${params.email}`,
      SK: "USER",
      pk: `EMAIL#${params.email}`,
      sk: "USER",
      userId: params.userId,
      email: params.email,
    };

    const userProfile: UserProfile = {
      EntityType: "USER_PROFILE",
      PK: `USER#${params.userId}`,
      SK: "PROFILE",
      pk: `USER#${params.userId}`,
      sk: "PROFILE",
      userId: params.userId,
      name: params.name,
      checkinCount: 0,
    };

    await ddbTransactWrite({
      TransactItems: [
        {
          Put: {
            TableName: params.tableName,
            Item: userEmail,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Put: {
            TableName: params.tableName,
            Item: userProfile,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      ],
    });

    return { userEmail, userProfile };
  },

  async updateUserName(params: {
    tableName: string;
    userId: string;
    name: string;
  }): Promise<UserProfile> {
    const pk = `USER#${params.userId}`;
    const sk = "PROFILE";

    const attrs = await ddbUpdate<UserProfile>({
      TableName: params.tableName,
      Key: { pk, sk },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": params.name },
      ConditionExpression: "attribute_exists(pk)",
      ReturnValues: "ALL_NEW",
    });

    if (!attrs) {
      throw new Error("Failed to update user profile");
    }

    return attrs;
  },

  async setStripeCustomerId(params: {
    tableName: string;
    userId: string;
    stripeCustomerId: string;
  }): Promise<void> {
    const pk = `USER#${params.userId}`;
    const sk = "PROFILE";

    await ddbUpdate({
      TableName: params.tableName,
      Key: { pk, sk },
      UpdateExpression: "SET stripeCustomerId = :stripeCustomerId",
      ExpressionAttributeValues: {
        ":stripeCustomerId": params.stripeCustomerId,
      },
      ConditionExpression: "attribute_exists(pk)",
    });
  },
};
