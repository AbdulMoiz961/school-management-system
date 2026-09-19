#!/usr/bin/env bash
# Phase 6 verification: fees + dashboard + at-risk.
set -u
API="${1:-http://localhost:5000}/api"
JH='Content-Type: application/json'
PASS=0; FAIL=0; NAMES=()

ck()  { if [ "$2" = "$3" ]; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — expected $3 got $2"; FAIL=$((FAIL+1)); NAMES+=("$1"); fi; }
ckc() { if echo "$2" | grep -q "$3"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — missing '$3' in: $(echo "$2"|head -c 140)"; FAIL=$((FAIL+1)); NAMES+=("$1"); fi; }
sec() { echo; echo "── $1 ────────────────────────────────────────"; }
st()  { local m="$1" u="$2" a="$3" b="${4:-}"
  case "$a" in Authorization:*) local h="$a";; *) local h="Authorization: Bearer $a";; esac
  if [ -n "$b" ]; then curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "$h" -H "$JH" -d "$b"
  else curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "$h"; fi; }
jg() { python3 -c "import sys,json
try: print(json.load(sys.stdin)$1)
except Exception: print('')"; }
login() { curl -s -X POST "$API/auth/login" -H "$JH" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jg "['data']['accessToken']"; }

STAMP=$(date +%s)
ADMIN=$(login admin@scholaris.dev Password123)
TEACHER=$(login teacher@scholaris.dev Password123)
STUDENT=$(login student@scholaris.dev Password123)
AD="Authorization: Bearer $ADMIN"; TH="Authorization: Bearer $TEACHER"; SH="Authorization: Bearer $STUDENT"

STUD=$(curl -s "$API/students?limit=1" -H "$AD" | jg "['data']['items'][0]['id']")
OWN=$(curl -s "$API/students/me" -H "$SH" | jg "['data']['id']")
echo "fixtures → student=$STUD"

sec "Invoice creation"
I1=$(curl -s -X POST "$API/fees" -H "$AD" -H "$JH" \
  -d "{\"studentId\":\"$STUD\",\"title\":\"Term fee $STAMP\",\"amount\":5000,\"dueDate\":\"2026-12-01\",\"currency\":\"PKR\"}")
IID=$(echo "$I1" | jg "['data']['id']")
ckc "admin creates invoice" "$I1" '"success":true'
ckc "status starts unpaid" "$I1" '"status":"unpaid"'
ckc "student name enriched" "$I1" '"studentName"'
ck "zero amount → 400" "$(st POST /fees "$AD" "{\"studentId\":\"$STUD\",\"title\":\"x\",\"amount\":0,\"dueDate\":\"2026-12-01\"}")" "400"
ck "missing student → 400" "$(st POST /fees "$AD" "{\"title\":\"x\",\"amount\":100,\"dueDate\":\"2026-12-01\"}")" "400"
ck "student cannot create → 403" "$(st POST /fees "$SH" "{\"studentId\":\"$STUD\",\"title\":\"x\",\"amount\":100,\"dueDate\":\"2026-12-01\"}")" "403"

sec "Payments & status derivation"
P1=$(curl -s -X POST "$API/fees/$IID/payments" -H "$AD" -H "$JH" -d '{"amount":2000,"method":"bank transfer","reference":"TXN-1"}')
ckc "payment recorded" "$P1" '"success":true'
ckc "status now partial" "$P1" '"status":"partial"'
ckc "amountPaid reflected" "$P1" '"amountPaid":2000'
ckc "payment carries reference" "$P1" '"reference":"TXN-1"'

# Over-payment must be refused.
ck "over-payment → 400" "$(st POST /fees/$IID/payments "$AD" '{"amount":99999}')" "400"

P2=$(curl -s -X POST "$API/fees/$IID/payments" -H "$AD" -H "$JH" -d '{"amount":3000}')
ckc "second payment settles the invoice" "$P2" '"status":"paid"'
ckc "amountPaid equals total" "$P2" '"amountPaid":5000'

# Paying a settled invoice is refused.
ck "payment on settled invoice → 400" "$(st POST /fees/$IID/payments "$AD" '{"amount":1}')" "400"
ck "negative payment → 400" "$(st POST /fees/$IID/payments "$AD" '{"amount":-5}')" "400"

sec "Overdue status"
OD=$(curl -s -X POST "$API/fees" -H "$AD" -H "$JH" \
  -d "{\"studentId\":\"$STUD\",\"title\":\"Overdue $STAMP\",\"amount\":1000,\"dueDate\":\"2020-01-01\"}" | jg "['data']['id']")
ckc "past-due unpaid invoice is overdue" \
  "$(curl -s "$API/fees?search=Overdue%20$STAMP" -H "$AD")" '"status":"overdue"'

sec "Student sees own invoices"
ME=$(curl -s "$API/fees/me" -H "$SH")
ckc "student can list own invoices" "$ME" '"success":true'
ckc "own invoice appears" "$ME" "$STAMP"

sec "Dashboard"
D=$(curl -s "$API/dashboard" -H "$AD")
ckc "dashboard returns counts" "$D" '"counts"'
ckc "counts include students" "$D" '"students"'
ckc "counts include teachers" "$D" '"teachers"'
ckc "attendance average present" "$D" '"average"'
ckc "fee summary present" "$D" '"collected"'
ckc "fee summary outstanding present" "$D" '"outstanding"'
ckc "at-risk array present" "$D" '"atRisk"'
ckc "recent activity present" "$D" '"recentActivity"'
# Fee summary must reflect the payments we just recorded (5000 collected).
ckc "collected reflects payments" "$D" '"collected":5000'

sec "Dashboard role scoping"
DT=$(curl -s "$API/dashboard" -H "$TH")
ckc "teacher dashboard loads" "$DT" '"success":true'
DS=$(curl -s "$API/dashboard" -H "$SH")
ckc "student dashboard loads" "$DS" '"success":true'
ckc "student dashboard has atRisk" "$DS" '"atRisk"'

sec "At-risk flagging"
# Mark the student absent enough times to trip the attendance threshold.
SUBJ=$(curl -s "$API/subjects?search=PHY-10" -H "$AD" | jg "['data']['items'][0]['id']")
for d in 1 2 3 4 5 6; do
  curl -s -X POST "$API/attendance/register" -H "$AD" -H "$JH" \
    -d "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-0$d-1$d\",\"entries\":[{\"studentId\":\"$STUD\",\"status\":\"absent\"}]}" >/dev/null
done
D2=$(curl -s "$API/dashboard" -H "$AD")
ckc "at-risk student flagged after absences" "$D2" '"reasons"'

sec "Cleanup"
curl -s -X DELETE "$API/fees/$IID" -H "$AD" >/dev/null
[ -n "$OD" ] && curl -s -X DELETE "$API/fees/$OD" -H "$AD" >/dev/null
echo "  ✓ invoices removed"

echo
echo "════════════════════════════════════════════════"
echo "   PASSED: $PASS    FAILED: $FAIL"
if [ ${#NAMES[@]} -gt 0 ]; then echo "   failures:"; for n in "${NAMES[@]}"; do echo "     - $n"; done; fi
echo "════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
