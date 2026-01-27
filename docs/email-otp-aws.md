# Email OTP API (AWS SES + DynamoDB) — Starter Guide

This repo is a Next.js App Router app. The OTP API is implemented as **Route Handlers**:

- `POST /api/otp/request` — create OTP, store hashed OTP in DynamoDB, send email via SES
- `POST /api/otp/verify` — verify OTP, delete OTP on success

## AWS setup

### 1) SES (Simple Email Service)

- **Verify an identity**:
  - Easiest: verify a **domain** (recommended for production)
  - Or verify a **single email address** (fine for dev)
- **Move out of sandbox** (for production):
  - In SES sandbox you can only send to verified recipients.
- Pick a region (example: `us-east-1`), and use the same region for SES + DynamoDB.

You’ll need a sender email:

- `SES_FROM_EMAIL` (must be verified in SES)

### 2) DynamoDB table

Create a table for OTPs.

- **Table name**: `court-check-beta` (or any name)
- **Partition key (PK)**: `pk` (String)
- **Sort key (SK)**: `sk` (String)
- **TTL attribute**: `expiresAt` (Number, Unix epoch seconds)

The code uses:

- `pk = EMAIL#<email>`
- `sk = PURPOSE#<purpose>`

#### Create table via script

```bash
AWS_REGION=us-east-1 DYNAMODB_TABLE=court-check-beta yarn otp:create-table
```

Enable TTL:

- DynamoDB console → your table → **Time to Live (TTL)** → enable
- TTL attribute name: `expiresAt`

### 3) IAM policy (minimal)

Attach to the role/user used by your Next.js server (local dev credentials or deployed role).

- **SES**: `ses:SendEmail`
- **DynamoDB**: `dynamodb:GetItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem`

Scope resources to:

- Your SES identity (optional, more complex)
- Your DynamoDB table ARN

## Local configuration

### 1) Install dependencies

```bash
yarn add @aws-sdk/client-ses @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

### 1.5) AWS credentials (for running scripts locally)

The DynamoDB table creation script (`yarn otp:create-table`) uses the AWS SDK default credential chain. Pick **one** of these approaches:

#### Install AWS CLI v2 (recommended)

If you want to use **Option B (profile)**, install AWS CLI **v2** first.

On macOS, easiest is Homebrew:

```bash
brew install awscli
aws --version
```

Alternative: AWS official installer (AWS CLI v2 `.pkg`):

- Download from AWS docs and install, then verify:

```bash
aws --version
```

##### Fix “my `aws` command is broken” (common on macOS)

If `aws configure` errors with a Python stack trace (or looks like Python 2), you likely have a different Python package named `aws` shadowing AWS CLI.

Run:

```bash
which -a aws
aws --version
```

Then remove the wrong one (examples):

```bash
python3 -m pip uninstall -y aws awscli
```

Re-check:

```bash
which -a aws
aws --version
```

You want something like `aws-cli/2.x.x ...` for v2.

#### Option A: Export env vars (quick)

```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
# If you are using temporary credentials (STS/SSO), you usually also need:
export AWS_SESSION_TOKEN="..."
```

Then run:

```bash
DYNAMODB_TABLE=court-check-beta yarn otp:create-table
```

#### Option B: Use an AWS CLI profile (recommended)

Configure once:

```bash
aws configure --profile court-check
```

Then run:

```bash
AWS_PROFILE=court-check AWS_SDK_LOAD_CONFIG=1 AWS_REGION=us-east-1 DYNAMODB_TABLE=court-check-beta yarn otp:create-table
```

If you **don’t have AWS CLI v2** available, you can still use a profile by creating repo-local files:

```bash
cp .aws/credentials.example .aws/credentials
cp .aws/config.example .aws/config
```

Edit `.aws/credentials` and `.aws/config`, then run:

```bash
AWS_SHARED_CREDENTIALS_FILE=.aws/credentials \
AWS_CONFIG_FILE=.aws/config \
AWS_PROFILE=court-check \
AWS_SDK_LOAD_CONFIG=1 \
DYNAMODB_TABLE=court-check-beta \
yarn otp:create-table
```

#### Option C: IAM role (deployed environments)

If you run this inside an environment with an attached IAM role (EC2/ECS/Lambda), you typically **do not** set keys manually—AWS provides credentials automatically.

### 2) Environment variables

Create `.env.local` in the project root:

```bash
# AWS
AWS_REGION=us-east-1
# (Local dev only) Use standard AWS vars if you need explicit credentials:
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...

# SES
SES_FROM_EMAIL=no-reply@yourdomain.com

# DynamoDB
DYNAMODB_TABLE=court-check-beta

# OTP security
# Use a long random secret (DO NOT commit it)
OTP_SECRET=change_me_to_a_long_random_secret

# Optional tuning
OTP_TTL_SECONDS=600
OTP_MIN_RESEND_SECONDS=60
OTP_MAX_ATTEMPTS=5
```

Notes:

- `OTP_SECRET` is used to **HMAC-hash** the OTP before storing (no plaintext OTP in DynamoDB).
- TTL cleanup is handled by DynamoDB TTL (not immediate; that’s normal). The API also checks expiry at read-time.

## API usage

### Request OTP

```bash
curl -X POST http://localhost:3000/api/otp/request \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","purpose":"login"}'
```

Response:

- `200 { "ok": true }`
- `429` if requesting too frequently

### Verify OTP

```bash
curl -X POST http://localhost:3000/api/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"enjoymyself1987@gmail.com","purpose":"login","code":"259028"}'
```

Response:

- `200 { "ok": true }` on success (OTP is deleted)
- `400 { "ok": false, "error": "Invalid or expired code" }` on failure

## Files added

- `src/app/api/otp/request/route.ts`
- `src/app/api/otp/verify/route.ts`
- `src/lib/aws.ts` — AWS SDK clients (SES + DynamoDB DocumentClient)
- `src/lib/otp.ts` — OTP generation + hashing helpers
- `src/lib/env.ts` — env var helpers

## Next improvements (recommended)

- Add an email template (HTML + branded styling).
- Add IP-based rate limiting (in addition to per-email cooldown).
- Add a “consumedAt” audit record (separate table) if you need compliance logs.
- For high-security flows, bind OTP to a session/nonce and include it in the hash payload.
