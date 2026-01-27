import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SESClient } from "@aws-sdk/client-ses";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let _ddbDoc: DynamoDBDocumentClient | null = null;
let _ses: SESClient | null = null;

function getRegion(): string {
  // AWS SDK standard env vars include AWS_REGION and AWS_DEFAULT_REGION
  return (
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1"
  );
}

export function ddbDoc(): DynamoDBDocumentClient {
  if (_ddbDoc) return _ddbDoc;
  const client = new DynamoDBClient({ region: getRegion() });
  _ddbDoc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return _ddbDoc;
}

export function ses(): SESClient {
  if (_ses) return _ses;
  _ses = new SESClient({ region: getRegion() });
  return _ses;
}
