import { Court, CourtEntitySchema } from "@/lib/schemas";
import { ddbQuery } from "@/services/dynamodb";

export const CourtService = {
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
