import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const tableName = process.env.DYNAMODB_TABLE;
if (!tableName) {
  throw new Error("Missing required env var: DYNAMODB_TABLE");
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const PHOTO_URL =
  "https://images.unsplash.com/photo-1521412644187-c49fa049e84d";

const courtGroups = [
  {
    city: "Las Vegas",
    name: "Bill Briare Park",
    courts: 4,
    addressLine: "650 N Tenaya Way, Las Vegas, NV 89128, USA",
  },
  {
    city: "Las Vegas",
    name: "Huckleberry Park",
    courts: 4,
    addressLine: "10325 Farm Rd, Las Vegas, NV, 89166, USA",
  },
  {
    city: "Las Vegas",
    name: "Aloha Shores Park",
    courts: 4,
    addressLine: "7550 Sauer Street, Las Vegas, Nevada 89128, United States",
  },
  {
    city: "Las Vegas",
    name: "Bob Price Recreation Center",
    courts: 6,
    addressLine: "2050 Bonnie Ln, Las Vegas, NV, 89156, USA",
  },
  {
    city: "Las Vegas",
    name: "Sunny Springs Park",
    courts: 2,
    addressLine: "7620 Golden Talon Ave, Las Vegas, NV, 89131, USA",
  },
  {
    city: "Las Vegas",
    name: "Sunset Park Pickleball Complex",
    courts: 24,
    addressLine: "2601 Sunset Park Rd, Las Vegas, NV 89120, USA",
  },
  {
    city: "Las Vegas",
    name: "Saddlebrook Park",
    courts: 1,
    addressLine: "1146 W Dorrell Ln, North Las Vegas, NV 89086, USA",
  },
  {
    city: "Las Vegas",
    name: "Ward 6 Pickleball Courts",
    courts: 2,
    addressLine:
      "Centennial Hills Park, 7101 North Buffalo Drive, Las Vegas, NV, USA",
  },
  {
    city: "Las Vegas",
    name: "Skye Hills Park at Farm Road",
    courts: 2,
    addressLine: "7599 Skye Hills St, Las Vegas, NV 89166, USA",
  },
  {
    city: "Las Vegas",
    name: "Whitney Mesa Tennis Complex",
    courts: 14,
    addressLine: "1661 Galleria Dr, Henderson, NV, 89014, USA",
  },
  {
    city: "Las Vegas",
    name: "Deer Springs Park",
    courts: 2,
    addressLine: "6550 Aviary Wy, North Las Vegas, NV 89084, USA",
  },
  {
    city: "Las Vegas",
    name: "Cadence Central Park",
    courts: 2,
    addressLine: "1170 E Sunset Rd, Henderson, NV, 89011, USA",
  },
  {
    city: "Las Vegas",
    name: "Paradise Recreation And Community Services Center",
    courts: 3,
    addressLine: "4775 McLeod Dr, Las Vegas, NV, 89121, USA",
  },
  {
    city: "Las Vegas",
    name: "Durango Hills Park",
    courts: 7,
    addressLine: "3521 N Durango Dr, Las Vegas, NV 89129, USA",
  },
  {
    city: "Las Vegas",
    name: "Bob Baskin Park",
    courts: 4,
    addressLine: "2801 W Oakey Blvd, Las Vegas, NV 89102, USA",
  },
  {
    city: "Las Vegas",
    name: "Hollywood Regional Park",
    courts: 8,
    addressLine: "1650 S. Hollywood Blvd., Las Vegas , NV 89142, USA",
  },
  {
    city: "Las Vegas",
    name: "Lt. Erik Lloyd Memorial Park",
    courts: 2,
    addressLine: "9665 W Patrick Ln, Las Vegas, NV 89148, United States",
  },
  {
    city: "Las Vegas",
    name: "Lone Mountain Park",
    courts: 4,
    addressLine: "4445 N Jensen St, Las Vegas, NV 89129, USA",
  },
  {
    city: "Las Vegas",
    name: "Desert Breeze Community Center",
    courts: 3,
    addressLine: "8275 Spring Mountain Rd, Las Vegas, NV, USA",
  },
  {
    city: "Las Vegas",
    name: "Police Memorial Park",
    courts: 8,
    addressLine: "3250 Metro Academy Way, Las Vegas, NV 89129, USA",
  },
  {
    city: "Las Vegas",
    name: "Neighborhood Recreation Center",
    courts: 1,
    addressLine: "1638 N Bruce St, North Las Vegas, NV, 89030, USA",
  },
  {
    city: "Las Vegas",
    name: "Oak Leaf Park Pickleball Courts",
    courts: 4,
    addressLine: "6303 Mesa Park Dr, Las Vegas, NV, 89135, USA",
  },
  {
    city: "FREMONT",
    name: "Fremont Tennis Center",
    courts: 7,
    addressLine: "1110 Stevenson Blvd, Fremont, CA, 94538, USA",
  },
  {
    city: "FREMONT",
    name: "Fremont Central Park Knoll",
    courts: 8,
    addressLine: "39701 Civic Center Drive, Fremont, CA 94538, USA",
  },
  {
    city: "FREMONT",
    name: "Knoll Central Park",
    courts: 8,
    addressLine: "39701 Civic Center Drive, Fremont, CA, USA",
  },
  {
    city: "HAYWARD",
    name: "Unity Park",
    courts: 6,
    addressLine: "20478 Mission Blvd, Hayward, CA 94541, United States",
  },
  {
    city: "HAYWARD",
    name: "SouthGate Hayward Pickleball Park",
    courts: 6,
    addressLine: "26780 Chiplay Ave, Hayward, CA, 94545, USA",
  },
  {
    city: "HAYWARD",
    name: "Weekes Community Center-Park",
    courts: 2,
    addressLine: "27182 Patrick Ave, Hayward, CA, 94544, USA",
  },
  {
    city: "SAN LEANDRO",
    name: "Washington Manor Park",
    courts: 6,
    addressLine: "14900 Zelma St, San Leandro, CA 94579, USA",
  },
  {
    city: "OAKLAND",
    name: "Montclair Pickleball Courts",
    courts: 4,
    addressLine: "1955 Mountain Blvd, Oakland, CA 94611, USA",
  },
  {
    city: "PLEASANTON",
    name: "Lifetime Activities",
    courts: 4,
    addressLine: "5801 Valley Ave, Pleasanton, CA, USA",
  },
  {
    city: "PLEASANTON",
    name: "Muirwood Community Park",
    courts: 6,
    addressLine: "4701 Muirwood Dr, Pleasanton, CA, 94588, USA",
  },
  {
    city: "DUBLIN",
    name: "Wallis Ranch Community Park",
    courts: 4,
    addressLine: "6501 Rutherford Dr, Dublin, CA 94568, USA",
  },
  {
    city: "DUBLIN",
    name: "Don Biddle Community Park",
    courts: 2,
    addressLine: "6100 Horizon Pkwy, Dublin, CA 94568, USA",
  },
  {
    city: "DANVILLE",
    name: "Osage Park",
    courts: 2,
    addressLine: "816 Brookside Dr, Danville, CA, 94526, USA",
  },
  {
    city: "SAN RAMON",
    name: "San Ramon Central Park",
    courts: 4,
    addressLine: "12501 Alcosta Blvd, San Ramon, California, USA",
  },
  {
    city: "SAN RAMON",
    name: "​​Sports Basement San Ramon",
    courts: 3,
    addressLine: "1041 Market Place San Ramon, CA 94583",
  },
  {
    city: "LIVERMORE",
    name: "Livermore Downs Park",
    courts: 4,
    addressLine: "2101 Paseo Laguna Seco, Livermore, CA, 94551, USA",
  },
  {
    city: "LIVERMORE",
    name: "May Nissen Park",
    courts: 8,
    addressLine: "685 Rincon Ave, Livermore, CA, 94551, USA",
  },
];

function buildCourtEntities() {
  const lastUpdatedAt = new Date().toISOString();
  const entities = [];

  for (const group of courtGroups) {
    const base = slugify(`${group.city}-${group.name}`);
    const id = base;
    const sk = `COURT#${id}`;

    entities.push({
      EntityType: "COURT",
      PK: "COURT",
      SK: sk,
      pk: "COURT",
      sk,
      id,
      name: group.name,
      addressLine: group.addressLine,
      courtCount: group.courts,
      status: "EMPTY",
      lastUpdatedAt,
      photoUrl: PHOTO_URL,
    });
  }

  return entities;
}

async function deleteOldPerCourtItems() {
  for (const group of courtGroups) {
    const base = slugify(`${group.city}-${group.name}`);
    for (let i = 1; i <= group.courts; i += 1) {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: "COURT", sk: `COURT#${base}-${i}` },
        })
      );
    }
  }
}

async function main() {
  await deleteOldPerCourtItems();
  const courtEntities = buildCourtEntities();

  for (const item of courtEntities) {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  }

  console.log(`Seeded ${courtEntities.length} courts into ${tableName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
