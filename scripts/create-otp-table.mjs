import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import dotenv from "dotenv";

// Load repo-local env (matches Next.js local dev convention)
dotenv.config({ path: ".env.local" });

// AWS Configuration (explicit, like the provided example)
const region =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const awsConfig = {
  region,
};

if (accessKeyId && secretAccessKey) {
  awsConfig.credentials = {
    accessKeyId,
    secretAccessKey,
  };
}

const tableName = process.env.DYNAMODB_TABLE || "court-check-beta";

const ddb = new DynamoDBClient(awsConfig);

async function tableExists() {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err?.name === "ResourceNotFoundException") return false;
    throw err;
  }
}

async function createTable() {
  console.log(`Creating table ${tableName} in ${region}...`);
  await ddb.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    })
  );
}

async function enableTtl() {
  console.log("Enabling TTL on attribute expiresAt...");
  await ddb.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        AttributeName: "expiresAt",
        Enabled: true,
      },
    })
  );
}

async function main() {
  if (await tableExists()) {
    console.log(`Table ${tableName} already exists. Skipping create.`);
  } else {
    await createTable();
    console.log(
      "CreateTable submitted. It may take a moment to become ACTIVE."
    );
  }

  try {
    await enableTtl();
    console.log("TTL enable submitted (may take some time to fully apply).");
  } catch (err) {
    // TTL enable fails if already enabled; keep it non-fatal.
    console.warn("TTL enable warning:", err?.name || err);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
