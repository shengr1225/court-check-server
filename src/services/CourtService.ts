import { Court, CourtEntitySchema } from "@/lib/schemas";
import { ddbGet, ddbQuery } from "@/services/dynamodb";

export const CourtService = {
  async getCourtById(params: {
    tableName: string;
    courtId: string;
  }): Promise<Court | undefined> {
    const item = await ddbGet<Record<string, unknown>>({
      tableName: params.tableName,
      key: { pk: "COURT", sk: `COURT#${params.courtId}` },
    });
    if (!item) return undefined;
    const entity = CourtEntitySchema.parse(item);
    return {
      id: entity.id,
      name: entity.name,
      addressLine: entity.addressLine,
      courtCount: entity.courtCount,
      status: entity.status,
      lastUpdatedAt: entity.lastUpdatedAt,
      photoUrl: entity.photoUrl,
    };
  },

  async listCourts(params: { tableName: string }): Promise<Court[]> {
    const items = await ddbQuery({
      tableName: params.tableName,
      keyConditionExpression: "#pk = :pk",
      expressionAttributeNames: { "#pk": "pk" },
      expressionAttributeValues: { ":pk": "COURT" },
    });

    return items.map((item) => {
      const entity = CourtEntitySchema.parse(item);
      return {
        id: entity.id,
        name: entity.name,
        addressLine: entity.addressLine,
        courtCount: entity.courtCount,
        status: entity.status,
        lastUpdatedAt: entity.lastUpdatedAt,
        photoUrl: entity.photoUrl,
      };
    });
  },
};
