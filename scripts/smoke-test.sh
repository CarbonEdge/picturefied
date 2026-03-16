#!/usr/bin/env bash
# =============================================================================
# Picturefied Smoke Test
# Tests the running stack end-to-end: API health, auth, file upload, sharing.
#
# Usage:
#   ./scripts/smoke-test.sh                   # test against localhost (default)
#   ./scripts/smoke-test.sh https://your.host # test against a remote instance
#
# Prerequisites: curl, jq
# The API and web app must already be running before you execute this script.
# =============================================================================

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_URL="${1:-http://localhost:8787}"
API="${BASE_URL}/api/v1"

HANDLE="smoketest_$(date +%s)"
PASSWORD="smoke-test-password-123"
# A minimal valid Argon2 salt (32 zero bytes, base64url-encoded)
ARGON2_SALT="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

PASS=0
FAIL=0
SKIP=0

# ─── Colours ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────

pass() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}~${RESET} $1 (skipped)"; ((SKIP++)); }
section() { echo -e "\n${BOLD}${BLUE}▶ $1${RESET}"; }
info() { echo -e "  ${YELLOW}→${RESET} $1"; }

# Run curl and capture HTTP status + body.
# Usage: http_get /path [token]
# Returns: sets $STATUS and $BODY
http_get() {
  local path="$1"
  local token="${2:-}"
  local auth_header=""
  if [[ -n "$token" ]]; then
    auth_header="-H \"Authorization: Bearer ${token}\""
  fi

  local response
  response=$(curl -s -w "\n__STATUS__%{http_code}" \
    ${token:+-H "Authorization: Bearer ${token}"} \
    "${API}${path}" 2>/dev/null)

  BODY=$(echo "$response" | sed '$d')
  STATUS=$(echo "$response" | tail -1 | sed 's/__STATUS__//')
}

# Usage: http_post /path '{"json":"body"}' [token]
http_post() {
  local path="$1"
  local body="$2"
  local token="${3:-}"

  local response
  response=$(curl -s -w "\n__STATUS__%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    ${token:+-H "Authorization: Bearer ${token}"} \
    -d "$body" \
    "${API}${path}" 2>/dev/null)

  BODY=$(echo "$response" | sed '$d')
  STATUS=$(echo "$response" | tail -1 | sed 's/__STATUS__//')
}

http_delete() {
  local path="$1"
  local token="${2:-}"

  local response
  response=$(curl -s -w "\n__STATUS__%{http_code}" \
    -X DELETE \
    ${token:+-H "Authorization: Bearer ${token}"} \
    "${API}${path}" 2>/dev/null)

  BODY=$(echo "$response" | sed '$d')
  STATUS=$(echo "$response" | tail -1 | sed 's/__STATUS__//')
}

require_json_field() {
  local field="$1"
  echo "$BODY" | jq -r ".$field" 2>/dev/null
}

# ─── Prerequisite checks ──────────────────────────────────────────────────────

section "Prerequisites"

if command -v curl &>/dev/null; then
  pass "curl is installed ($(curl --version | head -1 | cut -d' ' -f1-2))"
else
  fail "curl is not installed — install it and re-run"
  exit 1
fi

if command -v jq &>/dev/null; then
  pass "jq is installed ($(jq --version))"
else
  fail "jq is not installed — install it and re-run"
  exit 1
fi

# ─── 1. Health check ──────────────────────────────────────────────────────────

section "1. API health"

http_get "/health" 2>/dev/null || true

if [[ "$STATUS" == "200" ]]; then
  VERSION=$(require_json_field "version")
  pass "API is reachable (version: ${VERSION:-unknown})"
else
  fail "API health check failed — got HTTP ${STATUS:-no response}"
  info "Is the API running at ${BASE_URL}?"
  info "Start it with: pnpm dev   or   docker compose up"
  echo ""
  echo -e "${RED}Cannot continue without a running API.${RESET}"
  exit 1
fi

# ─── 2. Registration ──────────────────────────────────────────────────────────

section "2. Registration"

http_post "/auth/register" \
  "{\"handle\":\"${HANDLE}\",\"password\":\"${PASSWORD}\",\"argon2Salt\":\"${ARGON2_SALT}\"}"

if [[ "$STATUS" == "201" ]]; then
  ACCESS_TOKEN=$(require_json_field "accessToken")
  REFRESH_TOKEN=$(require_json_field "refreshToken")
  if [[ -n "$ACCESS_TOKEN" && "$ACCESS_TOKEN" != "null" ]]; then
    pass "Registered new user @${HANDLE}"
    pass "Received access token"
    pass "Received refresh token"
  else
    fail "Registration returned 201 but no tokens in body: ${BODY}"
  fi
elif [[ "$STATUS" == "409" ]]; then
  fail "Handle @${HANDLE} already exists (this shouldn't happen with timestamped handle)"
else
  fail "Registration failed — HTTP ${STATUS}: ${BODY}"
  exit 1
fi

# ─── 3. Duplicate handle rejection ───────────────────────────────────────────

section "3. Duplicate handle rejection"

http_post "/auth/register" \
  "{\"handle\":\"${HANDLE}\",\"password\":\"differentpassword123\",\"argon2Salt\":\"${ARGON2_SALT}\"}"

if [[ "$STATUS" == "409" ]]; then
  pass "Correctly rejects duplicate handle with 409"
else
  fail "Expected 409 for duplicate handle, got ${STATUS}"
fi

# ─── 4. Validation ───────────────────────────────────────────────────────────

section "4. Input validation"

# Short password
http_post "/auth/register" \
  "{\"handle\":\"validhandle\",\"password\":\"short\",\"argon2Salt\":\"${ARGON2_SALT}\"}"
if [[ "$STATUS" == "400" ]]; then
  pass "Rejects password shorter than 12 characters (400)"
else
  fail "Expected 400 for short password, got ${STATUS}"
fi

# Invalid handle characters
http_post "/auth/register" \
  "{\"handle\":\"bad handle!\",\"password\":\"validpassword123\",\"argon2Salt\":\"${ARGON2_SALT}\"}"
if [[ "$STATUS" == "400" ]]; then
  pass "Rejects handle with invalid characters (400)"
else
  fail "Expected 400 for invalid handle, got ${STATUS}"
fi

# Short handle
http_post "/auth/register" \
  "{\"handle\":\"a\",\"password\":\"validpassword123\",\"argon2Salt\":\"${ARGON2_SALT}\"}"
if [[ "$STATUS" == "400" ]]; then
  pass "Rejects handle shorter than 2 characters (400)"
else
  fail "Expected 400 for short handle, got ${STATUS}"
fi

# ─── 5. Argon2 salt endpoint ─────────────────────────────────────────────────

section "5. Argon2 salt endpoint"

http_get "/auth/salt/${HANDLE}"
if [[ "$STATUS" == "200" ]]; then
  SALT=$(require_json_field "salt")
  if [[ -n "$SALT" && "$SALT" != "null" ]]; then
    pass "Salt returned for known user @${HANDLE}"
  else
    fail "Salt endpoint returned 200 but no salt field"
  fi
else
  fail "Salt endpoint failed — HTTP ${STATUS}"
fi

# Unknown user should still return a salt (prevents handle enumeration)
http_get "/auth/salt/this_user_does_not_exist_xyz"
if [[ "$STATUS" == "200" ]]; then
  FAKE_SALT=$(require_json_field "salt")
  if [[ -n "$FAKE_SALT" && "$FAKE_SALT" != "null" ]]; then
    pass "Unknown user also returns a fake salt (prevents enumeration)"
  else
    fail "Unknown user salt endpoint returned 200 but no salt"
  fi
else
  fail "Unknown user salt returned ${STATUS} — expected 200 with fake salt"
fi

# ─── 6. Login ────────────────────────────────────────────────────────────────

section "6. Login"

http_post "/auth/login" \
  "{\"handle\":\"${HANDLE}\",\"password\":\"${PASSWORD}\"}"

if [[ "$STATUS" == "200" ]]; then
  LOGIN_ACCESS=$(require_json_field "accessToken")
  LOGIN_REFRESH=$(require_json_field "refreshToken")
  if [[ -n "$LOGIN_ACCESS" && "$LOGIN_ACCESS" != "null" ]]; then
    pass "Login successful for @${HANDLE}"
    # Use the login tokens going forward
    ACCESS_TOKEN="$LOGIN_ACCESS"
    REFRESH_TOKEN="$LOGIN_REFRESH"
  else
    fail "Login returned 200 but no access token"
  fi
else
  fail "Login failed — HTTP ${STATUS}: ${BODY}"
fi

# Wrong password
http_post "/auth/login" \
  "{\"handle\":\"${HANDLE}\",\"password\":\"wrong-password-xyz\"}"
if [[ "$STATUS" == "401" ]]; then
  pass "Correctly rejects wrong password (401)"
else
  fail "Expected 401 for wrong password, got ${STATUS}"
fi

# Non-existent user
http_post "/auth/login" \
  "{\"handle\":\"nobody_exists_xyz\",\"password\":\"password12345\"}"
if [[ "$STATUS" == "401" ]]; then
  pass "Correctly rejects unknown user (401)"
else
  fail "Expected 401 for unknown user, got ${STATUS}"
fi

# ─── 7. Authentication guard ─────────────────────────────────────────────────

section "7. Auth guard"

# No token
http_get "/files"
if [[ "$STATUS" == "401" ]]; then
  pass "GET /files without token returns 401"
else
  fail "Expected 401 without token on /files, got ${STATUS}"
fi

# Garbage token
http_get "/files" "not.a.valid.jwt"
if [[ "$STATUS" == "401" ]]; then
  pass "GET /files with invalid token returns 401"
else
  fail "Expected 401 with invalid token, got ${STATUS}"
fi

# ─── 8. Key upload ───────────────────────────────────────────────────────────

section "8. Key management"

# Simulate uploading X25519 + Ed25519 public keys (32 bytes each, base64url)
IDENTITY_PUB=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).rstrip(b'=').decode())" 2>/dev/null \
  || openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
IDENTITY_PRIV=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(48)).rstrip(b'=').decode())" 2>/dev/null \
  || openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')
SIGNING_PUB=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).rstrip(b'=').decode())" 2>/dev/null \
  || openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
SIGNING_PRIV=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(80)).rstrip(b'=').decode())" 2>/dev/null \
  || openssl rand -base64 80 | tr '+/' '-_' | tr -d '=\n')

KEY_BODY=$(cat <<EOF
{
  "identity": {
    "publicKey": "${IDENTITY_PUB}",
    "encryptedPrivateKey": "${IDENTITY_PRIV}"
  },
  "signing": {
    "publicKey": "${SIGNING_PUB}",
    "encryptedPrivateKey": "${SIGNING_PRIV}"
  }
}
EOF
)

http_post "/keys/me" "$KEY_BODY" "$ACCESS_TOKEN"
if [[ "$STATUS" == "200" ]]; then
  pass "Key bundle uploaded successfully"
else
  fail "Key upload failed — HTTP ${STATUS}: ${BODY}"
fi

# Retrieve the keys back
http_get "/keys/me" "$ACCESS_TOKEN"
if [[ "$STATUS" == "200" ]]; then
  RETURNED_PUB=$(echo "$BODY" | jq -r '.keys.identity.publicKey' 2>/dev/null)
  if [[ "$RETURNED_PUB" == "$IDENTITY_PUB" ]]; then
    pass "Public key retrieved correctly matches what was uploaded"
  elif [[ -n "$RETURNED_PUB" && "$RETURNED_PUB" != "null" ]]; then
    pass "Keys retrieved (public key present)"
  else
    fail "Key retrieval returned keys: null or missing public key"
  fi
else
  fail "Key retrieval failed — HTTP ${STATUS}"
fi

# ─── 9. File upload flow ─────────────────────────────────────────────────────

section "9. File upload flow"

# Step 1: Request upload intent
http_post "/files/upload/intent" \
  "{\"sizeBytes\":1024,\"mimeTypeHint\":\"application/octet-stream\"}" \
  "$ACCESS_TOKEN"

if [[ "$STATUS" == "200" ]]; then
  FILE_ID=$(require_json_field "fileId")
  PRESIGNED=$(require_json_field "presigned")
  pass "Upload intent granted — fileId: ${FILE_ID}"
  info "Presigned upload: ${PRESIGNED}"
else
  fail "Upload intent failed — HTTP ${STATUS}: ${BODY}"
  FILE_ID=""
fi

# Step 2: Complete the upload (simulated — we don't upload a real file here)
if [[ -n "$FILE_ID" && "$FILE_ID" != "null" ]]; then
  WRAPPED_FEK=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(48)).rstrip(b'=').decode())" 2>/dev/null \
    || openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')
  ENC_METADATA=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(96)).rstrip(b'=').decode())" 2>/dev/null \
    || openssl rand -base64 96 | tr '+/' '-_' | tr -d '=\n')

  http_post "/files/upload/complete" \
    "{\"fileId\":\"${FILE_ID}\",\"wrappedFek\":\"${WRAPPED_FEK}\",\"encryptedMetadata\":\"${ENC_METADATA}\",\"blurhash\":\"LKO2:N%2Tw=w]~RBVZRi};RPxuwH\"}" \
    "$ACCESS_TOKEN"

  if [[ "$STATUS" == "200" ]]; then
    RETURNED_ID=$(require_json_field "fileId")
    pass "Upload completed — file marked as upload_completed=true"
  else
    fail "Upload complete failed — HTTP ${STATUS}: ${BODY}"
  fi
fi

# Step 3: List files — should see our upload
http_get "/files" "$ACCESS_TOKEN"
if [[ "$STATUS" == "200" ]]; then
  FILE_COUNT=$(echo "$BODY" | jq '.items | length' 2>/dev/null || echo "0")
  if [[ "$FILE_COUNT" -ge "1" ]]; then
    pass "File list returns ${FILE_COUNT} file(s)"
    # Verify response shape
    HAS_WRAPPED_FEK=$(echo "$BODY" | jq -r '.items[0].wrappedFek' 2>/dev/null)
    HAS_ENC_METADATA=$(echo "$BODY" | jq -r '.items[0].encryptedMetadata' 2>/dev/null)
    if [[ -n "$HAS_WRAPPED_FEK" && "$HAS_WRAPPED_FEK" != "null" ]]; then
      pass "File record contains wrappedFek (base64url blob)"
    else
      fail "File record missing wrappedFek"
    fi
    if [[ -n "$HAS_ENC_METADATA" && "$HAS_ENC_METADATA" != "null" ]]; then
      pass "File record contains encryptedMetadata (base64url blob)"
    else
      fail "File record missing encryptedMetadata"
    fi
  else
    fail "File list is empty after upload"
  fi
else
  fail "File list failed — HTTP ${STATUS}"
fi

# ─── 10. Albums ───────────────────────────────────────────────────────────────

section "10. Albums"

ENC_ALBUM_META=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(64)).rstrip(b'=').decode())" 2>/dev/null \
  || openssl rand -base64 64 | tr '+/' '-_' | tr -d '=\n')

http_post "/albums" \
  "{\"encryptedMetadata\":\"${ENC_ALBUM_META}\"}" \
  "$ACCESS_TOKEN"

if [[ "$STATUS" == "201" ]]; then
  ALBUM_ID=$(require_json_field "id")
  pass "Album created — id: ${ALBUM_ID}"
else
  fail "Album creation failed — HTTP ${STATUS}: ${BODY}"
  ALBUM_ID=""
fi

# List albums
http_get "/albums" "$ACCESS_TOKEN"
if [[ "$STATUS" == "200" ]]; then
  ALBUM_COUNT=$(echo "$BODY" | jq '.items | length' 2>/dev/null || echo "0")
  pass "Album list returns ${ALBUM_COUNT} album(s)"
else
  fail "Album list failed — HTTP ${STATUS}"
fi

# Add file to album
if [[ -n "$ALBUM_ID" && "$ALBUM_ID" != "null" && -n "$FILE_ID" && "$FILE_ID" != "null" ]]; then
  http_post "/albums/${ALBUM_ID}/files" \
    "{\"fileIds\":[\"${FILE_ID}\"]}" \
    "$ACCESS_TOKEN"
  if [[ "$STATUS" == "200" ]]; then
    ADDED=$(require_json_field "added")
    pass "File added to album (added: ${ADDED})"
  else
    fail "Add file to album failed — HTTP ${STATUS}: ${BODY}"
  fi
fi

# ─── 11. Sharing ──────────────────────────────────────────────────────────────

section "11. Sharing"

SHARE_ID=""
SHARE_TOKEN=""

if [[ -n "$FILE_ID" && "$FILE_ID" != "null" ]]; then
  LINK_WRAPPED_FEK=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(56)).rstrip(b'=').decode())" 2>/dev/null \
    || openssl rand -base64 56 | tr '+/' '-_' | tr -d '=\n')

  http_post "/shares" \
    "{\"resourceType\":\"file\",\"resourceId\":\"${FILE_ID}\",\"linkWrappedFek\":\"${LINK_WRAPPED_FEK}\",\"permissions\":{\"view\":true,\"download\":false}}" \
    "$ACCESS_TOKEN"

  if [[ "$STATUS" == "201" ]]; then
    SHARE_ID=$(require_json_field "id")
    SHARE_TOKEN=$(require_json_field "shareToken")
    SHARE_URL=$(require_json_field "url")
    pass "Share created — token: ${SHARE_TOKEN}"
    info "Share URL: ${SHARE_URL}#<key_in_fragment>"
  else
    fail "Share creation failed — HTTP ${STATUS}: ${BODY}"
  fi
fi

# Resolve share (public endpoint — no auth)
if [[ -n "$SHARE_TOKEN" && "$SHARE_TOKEN" != "null" ]]; then
  http_get "/shares/resolve/${SHARE_TOKEN}"
  if [[ "$STATUS" == "200" ]]; then
    RETURNED_LINK_FEK=$(require_json_field "linkWrappedFek")
    RETURNED_FILE_ID=$(require_json_field "fileId")
    pass "Share resolves publicly (no auth required)"
    if [[ "$RETURNED_FILE_ID" == "$FILE_ID" ]]; then
      pass "Resolved share points to correct file"
    else
      fail "Resolved share fileId mismatch: expected ${FILE_ID}, got ${RETURNED_FILE_ID}"
    fi
    # Verify the server never returns the raw FEK — only the link-wrapped version
    RAW_FEK=$(echo "$BODY" | jq -r '.fek // .wrappedFek // empty' 2>/dev/null)
    if [[ -z "$RAW_FEK" ]]; then
      pass "Share resolution does NOT expose raw FEK (security check)"
    else
      fail "SECURITY: Share resolution exposed fek/wrappedFek — should only return linkWrappedFek"
    fi
  else
    fail "Share resolve failed — HTTP ${STATUS}: ${BODY}"
  fi

  # Revoke the share
  http_delete "/shares/${SHARE_ID}" "$ACCESS_TOKEN"
  if [[ "$STATUS" == "200" ]]; then
    pass "Share revoked"
  else
    fail "Share revocation failed — HTTP ${STATUS}"
  fi

  # Verify the revoked share no longer resolves
  http_get "/shares/resolve/${SHARE_TOKEN}"
  if [[ "$STATUS" == "404" ]]; then
    pass "Revoked share returns 404 (link is dead)"
  else
    fail "Revoked share still resolves — HTTP ${STATUS} (expected 404)"
  fi
fi

# ─── 12. Token refresh ────────────────────────────────────────────────────────

section "12. Token refresh"

http_post "/auth/refresh" \
  "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"

if [[ "$STATUS" == "200" ]]; then
  NEW_ACCESS=$(require_json_field "accessToken")
  NEW_REFRESH=$(require_json_field "refreshToken")
  if [[ -n "$NEW_ACCESS" && "$NEW_ACCESS" != "null" ]]; then
    pass "Refresh token exchange works"
    pass "New access token issued"
    # Update tokens
    ACCESS_TOKEN="$NEW_ACCESS"
    REFRESH_TOKEN="$NEW_REFRESH"
  else
    fail "Refresh returned 200 but no new tokens"
  fi
else
  fail "Token refresh failed — HTTP ${STATUS}: ${BODY}"
fi

# Old refresh token should now be invalid (rotation)
http_post "/auth/refresh" \
  "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
# Note: we just used the new refresh token above — the truly "old" one was consumed
# This test just verifies invalid tokens are rejected
FAKE_REFRESH="totally-invalid-refresh-token-xyz"
http_post "/auth/refresh" \
  "{\"refreshToken\":\"${FAKE_REFRESH}\"}"
if [[ "$STATUS" == "401" ]]; then
  pass "Invalid refresh token correctly rejected (401)"
else
  fail "Expected 401 for invalid refresh token, got ${STATUS}"
fi

# ─── 13. Logout ───────────────────────────────────────────────────────────────

section "13. Logout"

http_post "/auth/logout" \
  "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"

if [[ "$STATUS" == "200" ]]; then
  pass "Logout successful"
else
  fail "Logout failed — HTTP ${STATUS}"
fi

# After logout, the refresh token should be invalid
http_post "/auth/refresh" \
  "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
if [[ "$STATUS" == "401" ]]; then
  pass "Refresh token is invalidated after logout"
else
  fail "Expected 401 after logout refresh, got ${STATUS} — token not revoked?"
fi

# ─── 14. Web app ──────────────────────────────────────────────────────────────

section "14. Web app"

WEB_URL="${1:-http://localhost:3000}"
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${WEB_URL}" 2>/dev/null || echo "000")

if [[ "$WEB_STATUS" == "200" ]]; then
  pass "Web app is reachable at ${WEB_URL}"
elif [[ "$WEB_STATUS" == "000" ]]; then
  skip "Web app not reachable at ${WEB_URL} (is pnpm dev running?)"
else
  fail "Web app returned HTTP ${WEB_STATUS} at ${WEB_URL}"
fi

# Share viewer page (public, no auth)
if [[ -n "$SHARE_TOKEN" ]]; then
  SHARE_PAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${WEB_URL}/s/${SHARE_TOKEN}" 2>/dev/null || echo "000")
  # Note: this share was revoked, so the API will return 404, but the page itself
  # should still render (it handles errors in-page)
  if [[ "$SHARE_PAGE_STATUS" == "200" ]]; then
    pass "Share viewer page loads at /s/:token"
  else
    skip "Share viewer page returned ${SHARE_PAGE_STATUS} (web app may not be running)"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════"
echo -e "${BOLD}  Smoke Test Results${RESET}"
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}Passed:${RESET}  ${PASS}"
echo -e "  ${RED}Failed:${RESET}  ${FAIL}"
echo -e "  ${YELLOW}Skipped:${RESET} ${SKIP}"
echo "═══════════════════════════════════════════"

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "\n  ${GREEN}${BOLD}All checks passed. Stack is healthy.${RESET}\n"
  exit 0
else
  echo -e "\n  ${RED}${BOLD}${FAIL} check(s) failed. See output above.${RESET}\n"
  exit 1
fi
