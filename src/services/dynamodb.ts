import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDoc } from "@/lib/aws";

export async function ddbGet<TItem extends Record<string, unknown>>(params: {
  tableName: string;
  key: { pk: string; sk: string };
}): Promise<TItem | undefined> {
  const res = await ddbDoc().send(
    new GetCommand({
      TableName: params.tableName,
      Key: params.key,
    })
  );
  return res.Item as TItem | undefined;
}

export async function ddbUpdate<TAttributes extends Record<string, unknown>>(
  params: ConstructorParameters<typeof UpdateCommand>[0]
): Promise<TAttributes | undefined> {
  const res = await ddbDoc().send(new UpdateCommand(params));
  return res.Attributes as TAttributes | undefined;
}

export async function ddbDelete(
  params: ConstructorParameters<typeof DeleteCommand>[0]
): Promise<void> {
  await ddbDoc().send(new DeleteCommand(params));
}

export async function ddbTransactWrite(
  params: ConstructorParameters<typeof TransactWriteCommand>[0]
): Promise<void> {
  await ddbDoc().send(new TransactWriteCommand(params));
}

export async function ddbPut(
  params: ConstructorParameters<typeof PutCommand>[0]
): Promise<void> {
  await ddbDoc().send(new PutCommand(params));
}

export async function ddbQuery<TItem extends Record<string, unknown>>(params: {
  tableName: string;
  keyConditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  indexName?: string;
}): Promise<TItem[]> {
  const res = await ddbDoc().send(
    new QueryCommand({
      TableName: params.tableName,
      IndexName: params.indexName,
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: params.expressionAttributeValues,
    })
  );
  return (res.Items as TItem[] | undefined) ?? [];
}
