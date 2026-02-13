import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const tableName = process.env.DYNAMODB_TABLE;
if (!tableName) {
  throw new Error("Missing required env var: DYNAMODB_TABLE");
}

const googleApiKey = process.env.GOOGLE_API_KEY;
if (!googleApiKey) {
  throw new Error("Missing required env var: GOOGLE_API_KEY");
}

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function geocodeAddress(addressLine) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", addressLine);
  url.searchParams.set("key", googleApiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Geocode API request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "OK") {
    throw new Error(
      `Google Geocode API returned ${payload.status} for address: ${addressLine}`
    );
  }

  const location = payload.results?.[0]?.geometry?.location;
  if (
    !location ||
    typeof location.lat !== "number" ||
    typeof location.lng !== "number"
  ) {
    throw new Error(`Missing geocode location for address: ${addressLine}`);
  }

  return {
    lat: location.lat,
    long: location.lng,
  };
}

async function listCourtItems() {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const response = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":pk": "COURT" },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (response.Items) {
      items.push(...response.Items);
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function main() {
  const courts = await listCourtItems();

  for (const court of courts) {
    if (!court.addressLine || typeof court.addressLine !== "string") {
      throw new Error(`Court item missing addressLine: ${court.sk}`);
    }

    const { lat, long } = await geocodeAddress(court.addressLine);

    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: court.pk, sk: court.sk },
        UpdateExpression: "SET lat = :lat, #long = :long",
        ExpressionAttributeNames: {
          "#long": "long",
        },
        ExpressionAttributeValues: {
          ":lat": lat,
          ":long": long,
        },
      })
    );

    console.log(`Updated ${court.sk} -> lat=${lat}, long=${long}`);
  }

  console.log(`Updated geocode for ${courts.length} courts in ${tableName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
