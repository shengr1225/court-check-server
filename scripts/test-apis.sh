#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"
EMAIL="${2:-}"
OTP_CODE="${3:-}"
NEW_NAME="${4:-}"

if [[ -z "$BASE_URL" || -z "$EMAIL" ]]; then
  cat <<'USAGE'
Usage:
  scripts/test-apis.sh <base_url> <email> [otp_code] [new_name]

Examples:
  scripts/test-apis.sh http://localhost:3000 enjoymyself1987@gmail.com
  scripts/test-apis.sh http://localhost:3000 enjoymyself1987@gmail.com 123456 "Mingmin"
  scripts/test-apis.sh https://court-check-server.vercel.app you@example.com 123456 "New Name"

Notes:
  - If otp_code is omitted, the script will call /api/auth/request and stop.
    Re-run with the 6-digit code you received by email.
USAGE
  exit 1
fi

cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT

echo "Base URL: $BASE_URL"
echo "Email:    $EMAIL"
echo

echo "== 1) GET /api/docs =="
curl -sS -i "$BASE_URL/api/docs" | head -n 30
echo

echo "== 2) POST /api/auth/request =="
curl -sS -i -X POST "$BASE_URL/api/auth/request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}"
echo

if [[ -z "$OTP_CODE" ]]; then
  echo
  echo "OTP code not provided. Check your email, then re-run:"
  echo "  scripts/test-apis.sh \"$BASE_URL\" \"$EMAIL\" <6-digit-code> [new_name]"
  exit 0
fi

echo "== 3) POST /api/auth/verify (stores cookie) =="
curl -sS -i -c "$cookie_jar" -X POST "$BASE_URL/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$OTP_CODE\"}"
echo

echo "== 4) GET /api/auth/me (with cookie) =="
curl -sS -i -b "$cookie_jar" "$BASE_URL/api/auth/me"
echo

if [[ -n "$NEW_NAME" ]]; then
  echo "== 5) PATCH /api/auth/me (update name) =="
  curl -sS -i -b "$cookie_jar" -X PATCH "$BASE_URL/api/auth/me" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$NEW_NAME\"}"
  echo

  echo "== 6) GET /api/auth/me (confirm name) =="
  curl -sS -i -b "$cookie_jar" "$BASE_URL/api/auth/me"
  echo
fi

echo "== 7) POST /api/auth/logout (clears cookie) =="
curl -sS -i -b "$cookie_jar" -c "$cookie_jar" -X POST "$BASE_URL/api/auth/logout"
echo

echo "== 8) GET /api/auth/me (should be 401 after logout, with cookie jar) =="
curl -sS -i -b "$cookie_jar" "$BASE_URL/api/auth/me"
echo


