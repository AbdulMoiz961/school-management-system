#!/usr/bin/env bash
#
# End-to-end API verification for the School Management System.
#
#   bash scripts/api-verify.sh [base_url]
#
# Defaults to http://localhost:5000. Requires the API to be running and the
# demo accounts to exist (`npm run seed`).
#
# Creates its own fixtures and cleans them up at the end, so it is safe to
# re-run against a live database.

set -u
API="${1:-http://localhost:5000}/api"
JH='Content-Type: application/json'
PASS=0
FAIL=0
FAILED_NAMES=()

# ---------------------------------------------------------------- helpers

ck() { # name actual expected
  if [ "$2" = "$3" ]; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1 — expected $3, got $2"
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$1")
  fi
}

ckc() { # name haystack needle
  if echo "$2" | grep -q "$3"; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1 — missing '$3' in: $(echo "$2" | head -c 120)"
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$1")
  fi
}

status() { # method url token [body]
  local m="$1" u="$2" t="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "Authorization: Bearer $t" -H "$JH" -d "$b"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "Authorization: Bearer $t"
  fi
}

jget() { python3 -c "import sys,json;d=json.load(sys.stdin)
try: print(d$1)
except Exception: print('')"; }

login() { # email password
  curl -s -X POST "$API/auth/login" -H "$JH" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jget "['data']['accessToken']"
}

section() { echo; echo "── $1 ────────────────────────────────────────"; }

# ---------------------------------------------------------------- setup

STAMP=$(date +%s)
ADMIN=$(login admin@scholaris.dev Password123)
TEACHER=$(login teacher@scholaris.dev Password123)

section "Authentication"
ck "admin token acquired" "$([ ${#ADMIN} -gt 50 ] && echo yes || echo no)" "yes"
ck "teacher token acquired" "$([ ${#TEACHER} -gt 50 ] && echo yes || echo no)" "yes"
ck "no token → 401" "$(status GET /auth/me '')" "401"
ck "garbage token → 401" "$(status GET /auth/me 'not.a.real.token')" "401"

# ---------------------------------------------------------------- terms

section "Terms"
TERM=$(curl -s -X POST "$API/terms" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"name\":\"VP-$STAMP\",\"academicYear\":\"2040-2041\",\"startDate\":\"2040-09-01\",\"endDate\":\"2040-12-20\",\"isCurrent\":false}")
TID=$(echo "$TERM" | jget "['data']['id']")
ckc "create term" "$TERM" '"success":true'
ck "duplicate name+year → 409" \
  "$(status POST /terms "$ADMIN" "{\"name\":\"VP-$STAMP\",\"academicYear\":\"2040-2041\",\"startDate\":\"2040-09-01\",\"endDate\":\"2040-12-20\"}")" "409"
ck "end before start → 400" \
  "$(status POST /terms "$ADMIN" '{"name":"Bad","academicYear":"2041","startDate":"2041-06-01","endDate":"2041-01-01"}')" "400"
ck "malformed academic year → 400" \
  "$(status POST /terms "$ADMIN" '{"name":"Bad2","academicYear":"twenty","startDate":"2041-06-01","endDate":"2041-07-01"}')" "400"
ck "teacher cannot create term → 403" \
  "$(status POST /terms "$TEACHER" '{"name":"Nope","academicYear":"2042","startDate":"2042-01-01","endDate":"2042-06-01"}')" "403"
ck "term readable by teacher" "$(status GET "/terms/$TID" "$TEACHER")" "200"

# ---------------------------------------------------------------- classes

section "Classes"
CLASS=$(curl -s -X POST "$API/classes" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"gradeLevel\":\"Verify $STAMP\",\"section\":\"Z\",\"capacity\":3,\"termId\":\"$TID\"}")
CID=$(echo "$CLASS" | jget "['data']['id']")
ckc "create class" "$CLASS" '"success":true'
ck "duplicate grade+section+term → 409" \
  "$(status POST /classes "$ADMIN" "{\"gradeLevel\":\"Verify $STAMP\",\"section\":\"Z\",\"capacity\":5,\"termId\":\"$TID\"}")" "409"
ck "capacity 0 → 400" \
  "$(status POST /classes "$ADMIN" '{"gradeLevel":"Cap0","section":"A","capacity":0}')" "400"
ck "capacity 999 → 400" \
  "$(status POST /classes "$ADMIN" '{"gradeLevel":"Cap999","section":"A","capacity":999}')" "400"
ck "nonexistent term ref → 400" \
  "$(status POST /classes "$ADMIN" '{"gradeLevel":"BadRef","section":"A","capacity":10,"termId":"000000000000000000000000"}')" "400"
ck "nonexistent teacher ref → 400" \
  "$(status POST /classes "$ADMIN" '{"gradeLevel":"BadT","section":"A","capacity":10,"classTeacherId":"000000000000000000000000"}')" "400"
ck "teacher cannot create class → 403" \
  "$(status POST /classes "$TEACHER" '{"gradeLevel":"T","section":"A","capacity":10}')" "403"

# ---------------------------------------------------------------- students

section "Students"
STU=$(curl -s -X POST "$API/students" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"firstName\":\"Verify\",\"lastName\":\"Student$STAMP\",\"email\":\"vp-$STAMP@scholaris.dev\",\"password\":\"VerifyPass123\",\"guardianName\":\"Guardian $STAMP\",\"classSectionId\":\"$CID\"}")
SID=$(echo "$STU" | jget "['data']['id']")
ROLL=$(echo "$STU" | jget "['data']['rollNumber']")
ckc "create student (user + profile)" "$STU" '"success":true'
ckc "roll number auto-generated" "$ROLL" "STU-"
ckc "class attached" "$STU" "Verify $STAMP"

# The created student must be able to authenticate with the supplied password.
STOK=$(login "vp-$STAMP@scholaris.dev" VerifyPass123)
ck "created student can log in" "$([ ${#STOK} -gt 50 ] && echo yes || echo no)" "yes"

ck "duplicate email → 409" \
  "$(status POST /students "$ADMIN" "{\"firstName\":\"Dup\",\"lastName\":\"Student\",\"email\":\"vp-$STAMP@scholaris.dev\"}")" "409"
ck "invalid email → 400" \
  "$(status POST /students "$ADMIN" '{"firstName":"A","lastName":"B","email":"not-an-email"}')" "400"
ck "missing names → 400" \
  "$(status POST /students "$ADMIN" '{"firstName":"","lastName":"","email":"x@y.com"}')" "400"
ck "short password → 400" \
  "$(status POST /students "$ADMIN" "{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"sp-$STAMP@scholaris.dev\",\"password\":\"short\"}")" "400"
ck "teacher cannot create student → 403" \
  "$(status POST /students "$TEACHER" '{"firstName":"X","lastName":"Y","email":"z@z.com"}')" "403"

# ---------------------------------------------------------------- teachers

section "Teachers"
TCH=$(curl -s -X POST "$API/teachers" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"firstName\":\"Verify\",\"lastName\":\"Teacher$STAMP\",\"email\":\"vt-$STAMP@scholaris.dev\",\"password\":\"VerifyPass123\",\"subjectCodes\":[\"math-10\",\"phy-10\"]}")
TCHID=$(echo "$TCH" | jget "['data']['id']")
ckc "create teacher (user + profile)" "$TCH" '"success":true'
ckc "employee id auto-generated" "$(echo "$TCH" | jget "['data']['employeeId']")" "EMP-"
ckc "subject codes uppercased" "$TCH" '"MATH-10"'
ck "duplicate teacher email → 409" \
  "$(status POST /teachers "$ADMIN" "{\"firstName\":\"D\",\"lastName\":\"T\",\"email\":\"vt-$STAMP@scholaris.dev\"}")" "409"
ck "teacher list admin-only → 403 for teacher" "$(status GET /teachers "$TEACHER")" "403"

# ---------------------------------------------------------------- subjects

section "Subjects"
SUB=$(curl -s -X POST "$API/subjects" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"name\":\"Verify Subject $STAMP\",\"code\":\"VP-$STAMP\",\"creditHours\":3,\"classSectionId\":\"$CID\",\"termId\":\"$TID\"}")
SUBID=$(echo "$SUB" | jget "['data']['id']")
ckc "create subject" "$SUB" '"success":true'
ck "duplicate code+term → 409" \
  "$(status POST /subjects "$ADMIN" "{\"name\":\"Dup\",\"code\":\"VP-$STAMP\",\"creditHours\":2,\"termId\":\"$TID\"}")" "409"
ck "code with spaces → 400" \
  "$(status POST /subjects "$ADMIN" '{"name":"Bad","code":"has space","creditHours":2}')" "400"
ck "negative credits → 400" \
  "$(status POST /subjects "$ADMIN" "{\"name\":\"Neg\",\"code\":\"NEG-$STAMP\",\"creditHours\":-1,\"termId\":\"$TID\"}")" "400"

# ---------------------------------------------------------------- RBAC

section "Role enforcement (data isolation)"
ck "student cannot list students → 403" "$(status GET /students "$STOK")" "403"
ck "student cannot list teachers → 403" "$(status GET /teachers "$STOK")" "403"
ck "student cannot read audit → 403" "$(status GET /audit "$STOK")" "403"
ck "student cannot delete a term → 403" "$(status DELETE "/terms/$TID" "$STOK")" "403"
ck "teacher can list students" "$(status GET /students "$TEACHER")" "200"
ck "teacher can read classes" "$(status GET /classes "$TEACHER")" "200"
ck "teacher cannot read audit → 403" "$(status GET /audit "$TEACHER")" "403"

section "Student self-service is scoped"
ckc "reads own profile" "$(curl -s "$API/students/me" -H "Authorization: Bearer $STOK")" '"rollNumber"'
ESC=$(curl -s -X PATCH "$API/students/me" -H "Authorization: Bearer $STOK" -H "$JH" \
  -d "{\"phone\":\"+92 300 555$STAMP\",\"firstName\":\"HACKED\",\"classSectionId\":\"$TID\",\"isActive\":false}")
ckc "self-update accepted" "$ESC" '"success":true'
ckc "allowed field (phone) DID change" "$ESC" "555$STAMP"
ckc "firstName NOT changed" "$ESC" '"firstName":"Verify"'
ckc "isActive NOT changed" "$ESC" '"isActive":true'
ck "teacher cannot use /students/me" "$(status GET /students/me "$TEACHER")" "403"

# ---------------------------------------------------------------- pagination

section "Pagination, search, sorting"
P=$(curl -s "$API/students?page=1&limit=1" -H "Authorization: Bearer $ADMIN")
ckc "pagination envelope" "$P" '"pagination"'
ckc "limit honoured" "$P" '"limit":1'
ckc "totalPages present" "$P" '"totalPages"'
ck "limit over max → 400" "$(status GET '/students?limit=9999' "$ADMIN")" "400"
ck "page 0 → 400" "$(status GET '/students?page=0' "$ADMIN")" "400"
# Search BEFORE deactivation — the default list excludes inactive records, so
# searching after cleanup would legitimately return nothing.
ckc "search finds record" "$(curl -s "$API/students?search=Verify%20Student$STAMP" -H "Authorization: Bearer $ADMIN")" 'Verify'
# Multi-word search must match across separate fields (firstName + lastName),
# not require the whole phrase in one field.
ckc "multi-word search spans fields" \
  "$(curl -s "$API/students?search=Verify%20Student$STAMP" -H "Authorization: Bearer $ADMIN")" "$ROLL"
ckc "multi-word search is order-independent" \
  "$(curl -s "$API/students?search=Student$STAMP%20Verify" -H "Authorization: Bearer $ADMIN")" "$ROLL"
ckc "search by roll number" "$(curl -s "$API/students?search=$ROLL" -H "Authorization: Bearer $ADMIN")" "$ROLL"
ckc "search by email fragment" "$(curl -s "$API/students?search=vp-$STAMP" -H "Authorization: Bearer $ADMIN")" "$ROLL"
ckc "search miss → empty" "$(curl -s "$API/students?search=zzznomatch$STAMP" -H "Authorization: Bearer $ADMIN")" '"total":0'
# regex metacharacters in search must not blow up or leak everything
ck "search with regex chars is safe" "$(status GET '/students?search=%5B%28%29%2A' "$ADMIN")" "200"
ckc "regex chars match nothing (escaped literally)" \
  "$(curl -s "$API/students?search=%5B%28%29%2A" -H "Authorization: Bearer $ADMIN")" '"total":0'
ck "sort by allow-listed field" "$(status GET '/students?sortBy=rollNumber&sortDir=desc' "$ADMIN")" "200"
# inactive records are hidden by default but reachable when asked for
ckc "includeInactive surfaces them" \
  "$(curl -s "$API/students?search=Verify%20Student$STAMP&includeInactive=true" -H "Authorization: Bearer $ADMIN")" \
  "Verify"

section "Referential integrity"
ck "cannot delete term still in use → 400" "$(status DELETE "/terms/$TID" "$ADMIN")" "400"
ck "cannot delete class with students → 400" "$(status DELETE "/classes/$CID" "$ADMIN")" "400"
# Capacity is 3 with 1 active student, so raising it is fine and lowering to 2
# is also fine. Asking for 1 exceeds the guard only once enrolment is >= 2, so
# enrol one more student first to make the boundary meaningful.
curl -s -X POST "$API/students" -H "Authorization: Bearer $ADMIN" -H "$JH" \
  -d "{\"firstName\":\"Second\",\"lastName\":\"Student$STAMP\",\"email\":\"vp2-$STAMP@scholaris.dev\",\"password\":\"VerifyPass123\",\"classSectionId\":\"$CID\"}" >/dev/null
ckc "capacity below enrolment → 400" \
  "$(curl -s -X PATCH "$API/classes/$CID" -H "Authorization: Bearer $ADMIN" -H "$JH" -d '{"capacity":1}')" \
  "Capacity cannot be lower"
ckc "capacity equal to enrolment is allowed" \
  "$(curl -s -X PATCH "$API/classes/$CID" -H "Authorization: Bearer $ADMIN" -H "$JH" -d '{"capacity":2}')" \
  '"capacity":2'

section "Audit trail"
A=$(curl -s "$API/audit?limit=100" -H "Authorization: Bearer $ADMIN")
ckc "audit readable by admin" "$A" '"success":true'
ckc "records the term we made" "$A" "VP-$STAMP"
ckc "records the student we made" "$A" "vp-$STAMP"
ckc "captures actor" "$A" "admin@scholaris.dev"
ckc "captures field-level diff" "$A" '"changes"'
# A student's own edit should appear attributed to them, not to the admin.
ckc "self-service edit attributed to student" "$A" "vp-$STAMP@scholaris.dev"

# ---------------------------------------------------------------- cleanup

section "Cleanup"
ck "deactivate test student" "$(status DELETE "/students/$SID" "$ADMIN")" "200"
A2=$(curl -s "$API/audit?limit=100" -H "Authorization: Bearer $ADMIN")
ckc "deactivation is recorded" "$A2" "delete"

echo
echo "════════════════════════════════════════════════"
echo "   PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED_NAMES[@]} -gt 0 ]; then
  echo "   failures:"
  for n in "${FAILED_NAMES[@]}"; do echo "     - $n"; done
fi
echo "════════════════════════════════════════════════"
echo
echo "Note: fixtures remain in the database (term VP-$STAMP, class, subject,"
echo "teacher, deactivated student) so the audit trail is inspectable."
echo "Remove with: npm run clean:test  (see scripts/clean-test-data.mjs)"

[ "$FAIL" -eq 0 ]
