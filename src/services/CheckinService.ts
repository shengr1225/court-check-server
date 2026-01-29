import crypto from "node:crypto";
import { Checkin, CheckinEntity, CourtStatus } from "@/lib/schemas";
import { ddbTransactWrite } from "@/services/dynamodb";

export const CheckinService = {
  generateCheckinId(): string {
    return crypto.randomUUID();
  },

  async createCheckin(params: {
    tableName: string;
    courtId: string;
    userId: string;
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
      ],
    });

    return {
      checkinId,
      courtId: params.courtId,
      userId: params.userId,
      status: params.status,
      createdAt,
      photoUrl: params.photoUrl,
    };
  },
};
