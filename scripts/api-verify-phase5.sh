#!/usr/bin/env bash
#
# Phase 5 verification: assignments, submissions, grading, exams, report cards.
#   bash scripts/api-verify-phase5.sh [base_url]
set -u
API="${1:-http://localhost:5000}/api"
JH='Content-Type: application/json'
PASS=0; FAIL=0; NAMES=()

ck()  { if [ "$2" = "$3" ]; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — expected $3 got $2"; FAIL=$((FAIL+1)); NAMES+=("$1"); fi; }
ckc() { if echo "$2" | grep -q "$3"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — missing '$3' in: $(echo "$2"|head -c 140)"; FAIL=$((FAIL+1)); NAMES+=("$1"); fi; }
ckn() { if echo "$2" | grep -q "$3"; then echo "  ✗ $1 — should NOT contain '$3'"; FAIL=$((FAIL+1)); NAMES+=("$1"); else echo "  ✓ $1"; PASS=$((PASS+1)); fi; }
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

# Seeded fixtures. PHY-10 has the demo teacher assigned.
CLASS=$(curl -s "$API/classes?search=Grade%2010" -H "$AD" | jg "['data']['items'][0]['id']")
SUBJ=$(curl -s "$API/subjects?search=PHY-10" -H "$AD" | jg "['data']['items'][0]['id']")
STUD=$(curl -s "$API/students?limit=1" -H "$AD" | jg "['data']['items'][0]['id']")
OWN=$(curl -s "$API/students/me" -H "$SH" | jg "['data']['id']")
# A second student is needed for the cross-student check: comparing a student
# against themselves would trivially pass.
OTHER_STU=$(curl -s -X POST "$API/students" -H "$AD" -H "$JH" \
  -d "{\"firstName\":\"Other\",\"lastName\":\"Probe$STAMP\",\"email\":\"p5-$STAMP@scholaris.dev\",\"password\":\"VerifyPass123\"}" \
  | jg "['data']['id']")
echo "fixtures → class=$CLASS subject=$SUBJ student=$STUD"

sec "Assignment creation"
A1=$(curl -s -X POST "$API/assignments" -H "$AD" -H "$JH" \
  -d "{\"subjectId\":\"$SUBJ\",\"title\":\"Verify HW $STAMP\",\"description\":\"Do the thing.\",\"dueDate\":\"2030-06-01T00:00:00.000Z\",\"maxMarks\":50}")
AID=$(echo "$A1" | jg "['data']['id']")
ckc "admin creates assignment" "$A1" '"success":true'
ckc "subject name enriched" "$A1" '"subjectName"'
ck "no maxMarks → 400" "$(st POST /assignments "$AD" "{\"subjectId\":\"$SUBJ\",\"title\":\"x\",\"dueDate\":\"2030-06-01\"}")" "400"
ck "maxMarks 0 → 400" "$(st POST /assignments "$AD" "{\"subjectId\":\"$SUBJ\",\"title\":\"x\",\"dueDate\":\"2030-06-01\",\"maxMarks\":0}")" "400"
ck "bad due date → 400" "$(st POST /assignments "$AD" "{\"subjectId\":\"$SUBJ\",\"title\":\"x\",\"dueDate\":\"notadate\",\"maxMarks\":10}")" "400"
ck "student cannot create → 403" "$(st POST /assignments "$SH" "{\"subjectId\":\"$SUBJ\",\"title\":\"x\",\"dueDate\":\"2030-06-01\",\"maxMarks\":10}")" "403"

sec "Submitting work (isLate computed server-side)"
# Due 2030 → not late.
S1=$(curl -s -X POST "$API/assignments/$AID/submit" -H "$SH" -H "$JH" -d '{"content":"My answer."}')
ckc "student submits" "$S1" '"success":true'
ckc "on-time submission is not late" "$S1" '"isLate":false'

# A past-due assignment must be flagged late even though the client sends nothing.
PAST=$(curl -s -X POST "$API/assignments" -H "$AD" -H "$JH" \
  -d "{\"subjectId\":\"$SUBJ\",\"title\":\"Overdue $STAMP\",\"dueDate\":\"2020-01-01T00:00:00.000Z\",\"maxMarks\":20}" | jg "['data']['id']")
LATE=$(curl -s -X POST "$API/assignments/$PAST/submit" -H "$SH" -H "$JH" -d '{"content":"Better late."}')
ckc "past-due submission is marked late" "$LATE" '"isLate":true'

# Client cannot dictate lateness.
FORGED=$(curl -s -X POST "$API/assignments/$PAST/submit" -H "$SH" -H "$JH" -d '{"content":"x","isLate":false}')
ckn "client-supplied isLate is ignored" "$FORGED" '"isLate":false'

ck "empty submission → 400" "$(st POST /assignments/$AID/submit "$SH" '{}')" "400"
# A teacher has no student profile at all, so this is a 404 rather than a 403.
ck "teacher cannot submit (no student profile)" "$(st POST /assignments/$AID/submit "$TH" '{"content":"x"}')" "404"

sec "Grading"
SUBS=$(curl -s "$API/assignments/$AID/submissions" -H "$TH")
SUBD=$(echo "$SUBS" | jg "['data'][0]['id']")
ckc "grading queue lists submission" "$SUBS" '"studentName"'
ckc "queue reports maxMarks" "$SUBS" '"maxMarks":50'
G=$(curl -s -X PATCH "$API/submissions/$SUBD/grade" -H "$TH" -H "$JH" -d '{"marks":42,"feedback":"Good."}')
ckc "grade accepted" "$G" '"marks":42'
ckc "feedback stored" "$G" '"feedback":"Good."'
ck "marks above maximum → 400" "$(st PATCH /submissions/$SUBD/grade "$TH" '{"marks":999}')" "400"
ck "negative marks → 400" "$(st PATCH /submissions/$SUBD/grade "$TH" '{"marks":-5}')" "400"
ck "student cannot grade → 403" "$(st PATCH /submissions/$SUBD/grade "$SH" '{"marks":50}')" "403"
# Regrading is allowed; re-submitting after grading is not.
ckc "regrading allowed" "$(curl -s -X PATCH "$API/submissions/$SUBD/grade" -H "$TH" -H "$JH" -d '{"marks":45}')" '"marks":45'
ckc "cannot resubmit once graded" \
  "$(curl -s -X POST "$API/assignments/$AID/submit" -H "$SH" -H "$JH" -d '{"content":"changed"}')" 'already been graded'

sec "Exam creation & marks entry"
E1=$(curl -s -X POST "$API/exams" -H "$AD" -H "$JH" \
  -d "{\"subjectId\":\"$SUBJ\",\"name\":\"Midterm $STAMP\",\"examDate\":\"2026-11-01\",\"maxMarks\":100}")
EID=$(echo "$E1" | jg "['data']['id']")
ckc "admin creates exam" "$E1" '"success":true'
ck "maxMarks over 1000 → 400" "$(st POST /exams "$AD" "{\"subjectId\":\"$SUBJ\",\"name\":\"x\",\"examDate\":\"2026-11-01\",\"maxMarks\":5000}")" "400"

SHEET=$(curl -s "$API/exams/$EID/sheet" -H "$TH")
ckc "sheet lists enrolled students" "$SHEET" '"rows"'
ckc "sheet reports the maximum" "$SHEET" '"maxMarks":100'
ckc "fresh sheet is not yet entered" "$SHEET" '"alreadyEntered":false'

ENTRIES=$(echo "$SHEET" | python3 -c "
import sys,json
rows=json.load(sys.stdin)['data']['rows']
print(json.dumps([{'studentId':r['studentId'],'marks':78} for r in rows]))")
M=$(curl -s -X POST "$API/exams/$EID/marks" -H "$TH" -H "$JH" -d "{\"entries\":$ENTRIES}")
ckc "marks saved" "$M" '"success":true'
ckc "sheet now shows entered" "$(curl -s "$API/exams/$EID/sheet" -H "$TH")" '"alreadyEntered":true'
ck "marks over exam max → 400" \
  "$(st POST /exams/$EID/marks "$TH" "{\"entries\":[{\"studentId\":\"$STUD\",\"marks\":500}]}")" "400"
ck "duplicate student in payload → 400" \
  "$(st POST /exams/$EID/marks "$TH" "{\"entries\":[{\"studentId\":\"$STUD\",\"marks\":10},{\"studentId\":\"$STUD\",\"marks\":20}]}")" "400"
ck "empty entries → 400" "$(st POST /exams/$EID/marks "$TH" '{"entries":[]}')" "400"

# Re-saving must update, not duplicate.
curl -s -X POST "$API/exams/$EID/marks" -H "$TH" -H "$JH" -d "{\"entries\":$ENTRIES}" >/dev/null
SHEET2=$(curl -s "$API/exams/$EID/sheet" -H "$TH")
N=$(echo "$SHEET2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']['rows']))")
M2=$(echo "$SHEET2" | python3 -c "
import sys,json
rows=json.load(sys.stdin)['data']['rows']
print(sum(1 for r in rows if r['marks'] is not None))")
ck "one mark per student after re-save" "$M2" "$N"

sec "Report card"
RC=$(curl -s "$API/results/report-card/$OWN" -H "$AD")
ckc "report card builds" "$RC" '"overallGrade"'
ckc "includes subject results" "$RC" '"subjects"'
ckc "has overall percentage" "$RC" '"overallPercentage"'
ckc "has student name" "$RC" '"studentName"'
ckc "subject carries a letter grade" "$RC" '"grade"'
# 78/100 exam + 45/50 assignment = 123/150 = 82%
ckc "percentage computed from both sources" "$RC" '"overallPercentage":82'
ckc "grade matches the percentage" "$RC" '"overallGrade":"A"'

ck "student reads own report card" "$(st GET "/results/report-card/$OWN" "$SH")" "200"
ck "student blocked from another student's card" "$(st GET "/results/report-card/$OTHER_STU" "$SH")" "403"

sec "Student's own results"
MR=$(curl -s "$API/results/me" -H "$SH")
ckc "results list returns" "$MR" '"success":true'
ckc "result shows exam name" "$MR" '"examName"'
ckc "result shows a grade" "$MR" '"grade"'

sec "Teacher scoping"
# A teacher creating an assignment for a subject they don't teach is refused.
OTHER=$(curl -s "$API/subjects?limit=50" -H "$AD" | python3 -c "
import sys,json
items=json.load(sys.stdin)['data']['items']
for s in items:
    if not s.get('teacherId'): print(s['id']); break")
if [ -n "$OTHER" ]; then
  ck "teacher blocked from unassigned subject" \
    "$(st POST /assignments "$TH" "{\"subjectId\":\"$OTHER\",\"title\":\"x\",\"dueDate\":\"2030-01-01\",\"maxMarks\":10}")" "403"
else
  echo "  – skipped (no unassigned subject)"
fi

sec "Audit"
AU=$(curl -s "$API/audit?limit=100" -H "$AD")
ckc "assignment recorded" "$AU" '"resource":"Assignment"'
ckc "submission recorded" "$AU" '"resource":"Submission"'
ckc "exam marks recorded" "$AU" '"resource":"ExamMark"'

sec "Cleanup"
curl -s -X DELETE "$API/assignments/$AID" -H "$AD" >/dev/null
[ -n "$PAST" ] && curl -s -X DELETE "$API/assignments/$PAST" -H "$AD" >/dev/null
curl -s -X DELETE "$API/exams/$EID" -H "$AD" >/dev/null
[ -n "$OTHER_STU" ] && curl -s -X DELETE "$API/students/$OTHER_STU" -H "$AD" >/dev/null
echo "  ✓ fixtures deactivated"

echo
echo "════════════════════════════════════════════════"
echo "   PASSED: $PASS    FAILED: $FAIL"
if [ ${#NAMES[@]} -gt 0 ]; then echo "   failures:"; for n in "${NAMES[@]}"; do echo "     - $n"; done; fi
echo "════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
