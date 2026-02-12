#!/usr/bin/env node
/**
 * Test script for courts API: list courts, checkin (with login), get court
 *
 * Usage:
 *   node scripts/test-courts.mjs <base_url> <email> [otp_code]
 *
 * Examples:
 *   node scripts/test-courts.mjs http://localhost:3000 you@example.com
 *   node scripts/test-courts.mjs http://localhost:3000 you@example.com 123456
 */

const BASE_URL = process.argv[2] || "";
const EMAIL = process.argv[3] || "";
const OTP_CODE = process.argv[4] || "";

if (!BASE_URL || !EMAIL) {
  console.log(`
Usage:
  node scripts/test-courts.mjs <base_url> <email> [otp_code]

Examples:
  node scripts/test-courts.mjs http://localhost:3000 you@example.com
  node scripts/test-courts.mjs http://localhost:3000 you@example.com 123456

Notes:
  - If otp_code is omitted, the script will call /api/auth/request and stop.
    Re-run with the 6-digit code you received by email.
`);
  process.exit(1);
}

function log(label, res, body) {
  console.log(`\n== ${label} ==`);
  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log("Body:", JSON.stringify(body, null, 2));
}

async function run() {
  const cookieJar = [];

  const fetchOptions = (opts = {}) => ({
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    redirect: "manual",
  });

  const handleResponse = (res) => {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const firstPart = setCookie.split(";")[0].trim();
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx > 0) {
        cookieJar.length = 0;
        cookieJar.push(firstPart);
      }
    }
    return res;
  };

  const cookies = () =>
    cookieJar.length ? { Cookie: cookieJar.join("; ") } : {};

  // 1) GET /api/courts
  const listRes = await fetch(
    `${BASE_URL}/api/courts`,
    fetchOptions({ headers: cookies() })
  );
  const listBody = await listRes.json();
  handleResponse(listRes);
  log("1) GET /api/courts", listRes, listBody);

  if (!listBody.ok || !listBody.courts?.length) {
    console.log("\nNo courts found. Seed courts first.");
    process.exit(1);
  }

  const courtId = listBody.courts[0].id;
  console.log(`\nUsing court id: ${courtId}`);

  // 2) GET /api/courts/[id] (before checkin)
  const getRes1 = await fetch(
    `${BASE_URL}/api/courts/${courtId}`,
    fetchOptions({ headers: cookies() })
  );
  const getBody1 = await getRes1.json();
  handleResponse(getRes1);
  log("2) GET /api/courts/[id] (before checkin)", getRes1, getBody1);

  if (!OTP_CODE) {
    // 3) POST /api/auth/request
    const reqRes = await fetch(
      `${BASE_URL}/api/auth/request`,
      fetchOptions({
        method: "POST",
        body: JSON.stringify({ email: EMAIL }),
      })
    );
    const reqBody = await reqRes.json();
    log("3) POST /api/auth/request", reqRes, reqBody);

    console.log("\nOTP code not provided. Check your email, then re-run:");
    console.log(
      `  node scripts/test-courts.mjs "${BASE_URL}" "${EMAIL}" <6-digit-code>`
    );
    process.exit(0);
  }

  // 4) POST /api/auth/verify (login)
  const verifyRes = await fetch(
    `${BASE_URL}/api/auth/verify`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({ email: EMAIL, code: OTP_CODE }),
    })
  );
  handleResponse(verifyRes);
  const verifyBody = await verifyRes.json();
  log("4) POST /api/auth/verify (login)", verifyRes, verifyBody);

  if (!verifyBody.ok) {
    console.log("\nLogin failed. Check OTP code.");
    process.exit(1);
  }

  // 5) POST /api/courts/[id]/checkin
  const checkinRes = await fetch(
    `${BASE_URL}/api/courts/${courtId}/checkin`,
    fetchOptions({
      method: "POST",
      headers: cookies(),
      body: JSON.stringify({ status: "LOW" }),
    })
  );
  const checkinBody = await checkinRes.json();
  log("5) POST /api/courts/[id]/checkin", checkinRes, checkinBody);

  if (!checkinBody.ok) {
    console.log("\nCheckin failed.");
    process.exit(1);
  }

  // 6) GET /api/courts/[id] (after checkin)
  const getRes2 = await fetch(
    `${BASE_URL}/api/courts/${courtId}`,
    fetchOptions({ headers: cookies() })
  );
  const getBody2 = await getRes2.json();
  log("6) GET /api/courts/[id] (after checkin)", getRes2, getBody2);

  console.log("\nAll tests completed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
