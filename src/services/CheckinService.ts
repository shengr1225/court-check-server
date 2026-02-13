import crypto from "node:crypto";
import {
  Checkin,
  CheckinEntity,
  CheckinEntitySchema,
  CourtStatus,
} from "@/lib/schemas";
import { ddbQuery, ddbTransactWrite } from "@/services/dynamodb";

export const CheckinService = {
  async listCheckinsByCourtId(params: {
    tableName: string;
    courtId: string;
  }): Promise<Checkin[]> {
    const items = await ddbQuery<Record<string, unknown>>({
      tableName: params.tableName,
      keyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
      expressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      expressionAttributeValues: {
        ":pk": `COURT#${params.courtId}`,
        ":skPrefix": "CHECKIN#",
      },
    });
    return items
      .map((item) => CheckinEntitySchema.parse(item))
      .map((e) => ({
        checkinId: e.checkinId,
        courtId: e.courtId,
        userId: e.userId,
        userName: e.userName,
        status: e.status,
        createdAt: e.createdAt,
        photoUrl: e.photoUrl,
      }));
  },

  generateCheckinId(): string {
    return crypto.randomUUID();
  },

  async createCheckin(params: {
    tableName: string;
    courtId: string;
    userId: string;
    userName: string;
    status: CourtStatus;
    photoUrl?: string;
  }): Promise<Checkin> {
    const checkinId = CheckinService.generateCheckinId();
    const createdAt = new Date().toISOString();

    const pk = `COURT#${params.courtId}`;
    const sk = `CHECKIN#${createdAt}#${checkinId}`;

    const item: CheckinEntity = {
      EntityType: "CHECKIN",
      PK: pk,
      SK: sk,
      pk,
      sk,
      checkinId,
      courtId: params.courtId,
      userId: params.userId,
      userName: params.userName,
      status: params.status,
      createdAt,
      photoUrl: params.photoUrl,
    };

    await ddbTransactWrite({
      TransactItems: [
        {
          Put: {
            TableName: params.tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Update: {
            TableName: params.tableName,
            Key: { pk: "COURT", sk: `COURT#${params.courtId}` },
            UpdateExpression: "SET #status = :status, #lastUpdatedAt = :nowIso",
            ExpressionAttributeNames: {
              "#status": "status",
              "#lastUpdatedAt": "lastUpdatedAt",
            },
            ExpressionAttributeValues: {
              ":status": params.status,
              ":nowIso": createdAt,
            },
            ConditionExpression: "attribute_exists(pk)",
          },
        },
        {
          Update: {
            TableName: params.tableName,
            Key: { pk: `USER#${params.userId}`, sk: "PROFILE" },
            UpdateExpression: "ADD checkinCount :one",
            ExpressionAttributeValues: {
              ":one": 1,
            },
            ConditionExpression: "attribute_exists(pk)",
          },
        },
      ],
    });

    return {
      checkinId,
      courtId: params.courtId,
      userId: params.userId,
      userName: params.userName,
      status: params.status,
      createdAt,
      photoUrl: params.photoUrl,
    };
  },

  async getLatestCheckinByUserAndCourt(params: {
    tableName: string;
    courtId: string;
    userId: string;
  }): Promise<Checkin | undefined> {
    const checkins = await CheckinService.listCheckinsByCourtId({
      tableName: params.tableName,
      courtId: params.courtId,
    });
    return checkins
      .filter((checkin) => checkin.userId === params.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },
};
