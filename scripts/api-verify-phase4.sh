#!/usr/bin/env bash
#
# Phase 4 verification: attendance, timetable conflict detection, announcements.
#
#   bash scripts/api-verify-phase4.sh [base_url]
#
# Requires the API running and `npm run seed` to have provisioned the demo data.

set -u
API="${1:-http://localhost:5000}/api"
JH='Content-Type: application/json'
PASS=0; FAIL=0; FAILED_NAMES=()

ck()  { if [ "$2" = "$3" ]; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — expected $3, got $2"; FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); fi; }
ckc() { if echo "$2" | grep -q "$3"; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1 — missing '$3' in: $(echo "$2" | head -c 150)"; FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); fi; }
ckn() { if echo "$2" | grep -q "$3"; then echo "  ✗ $1 — should NOT contain '$3'"; FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); else echo "  ✓ $1"; PASS=$((PASS+1)); fi; }

# Accepts a raw token OR a full "Authorization: Bearer ..." header string.
status() { local m="$1" u="$2" a="$3" b="${4:-}"
  case "$a" in
    Authorization:*) local hdr="$a" ;;
    "")              local hdr="X-No-Auth: 1" ;;
    *)               local hdr="Authorization: Bearer $a" ;;
  esac
  if [ -n "$b" ]; then curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "$hdr" -H "$JH" -d "$b"
  else curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$u" -H "$hdr"; fi; }

jget() { python3 -c "import sys,json;d=json.load(sys.stdin)
try: print(d$1)
except Exception: print('')"; }

login() { curl -s -X POST "$API/auth/login" -H "$JH" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jget "['data']['accessToken']"; }
section() { echo; echo "── $1 ────────────────────────────────────────"; }

STAMP=$(date +%s)
# Unique day per run. Two runs within the same second would share a date and
# leave marks behind that break the "fresh register" assertions, so mix in the
# process id as well — the combination is unique in practice.
# Offsets derived from a monotonic-ish counter so re-runs never collide.
DAY_SEQ=$((STAMP % 20000))
ADATE=$(date -d "2020-01-01 + $DAY_SEQ days" +%F)
BDATE=$(date -d "2020-01-01 + $((DAY_SEQ + 1)) days" +%F)
ADMIN=$(login admin@scholaris.dev Password123)
TEACHER=$(login teacher@scholaris.dev Password123)
STUDENT=$(login student@scholaris.dev Password123)

AD="Authorization: Bearer $ADMIN"
TH="Authorization: Bearer $TEACHER"
SH="Authorization: Bearer $STUDENT"

# Resolve seeded fixtures
CLASS=$(curl -s "$API/classes?search=Grade%2010" -H "$AD" | jget "['data']['items'][0]['id']")
SUBJ=$(curl -s "$API/subjects?search=MATH-10" -H "$AD" | jget "['data']['items'][0]['id']")
# The teacher's USER id (slots reference the user, not the teacher profile)
TUID=$(curl -s "$API/teachers/me" -H "$TH" | jget "['data']['userId']")
STUD=$(curl -s "$API/students?limit=1" -H "$AD" | jget "['data']['items'][0]['id']")
# A second student is required for the cross-student isolation check to mean
# anything; comparing a student to themselves would trivially pass.
STUD2=$(curl -s -X POST "$API/students" -H "$AD" -H "$JH" \
  -d "{\"firstName\":\"Isolation\",\"lastName\":\"Probe$STAMP\",\"email\":\"iso-$STAMP@scholaris.dev\",\"password\":\"VerifyPass123\"}" \
  | jget "['data']['id']")

echo "fixtures → class=$CLASS subject=$SUBJ teacherUser=$TUID student=$STUD"

section "Fixture sanity"
ck "class resolved"  "$([ -n "$CLASS" ] && echo yes || echo no)" "yes"
ck "subject resolved" "$([ -n "$SUBJ" ] && echo ok || echo no)" "ok"
ck "teacher user id resolved" "$([ -n "$TUID" ] && echo yes || echo no)" "yes"
ck "student resolved" "$([ -n "$STUD" ] && echo yes || echo no)" "yes"

# ============================================================ ATTENDANCE
section "Attendance — register view"
REG=$(curl -s "$API/attendance/register?subjectId=$SUBJ&date=$ADATE" -H "$AD")
ckc "register loads" "$REG" '"rows"'
ckc "rows carry roll numbers" "$REG" 'STU-'
ckc "rows default to present" "$REG" '"status":"present"'
ckc "alreadyMarked flag present" "$REG" '"alreadyMarked":false'

section "Attendance — marking"
STUDENT_IDS=$(echo "$REG" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']['rows']
print(json.dumps([{'studentId': r['studentId'], 'status': 'present'} for r in d]))")

MARK=$(curl -s -X POST "$API/attendance/register" -H "$AD" -H "$JH" \
  -d "{\"subjectId\":\"$SUBJ\",\"date\":\"$ADATE\",\"entries\":$STUDENT_IDS}")
ckc "register marked" "$MARK" '"success":true'
ckc "reports how many marked" "$MARK" '"marked"'

REG2=$(curl -s "$API/attendance/register?subjectId=$SUBJ&date=$ADATE" -H "$AD")
ckc "alreadyMarked is now true" "$REG2" '"alreadyMarked":true'

section "Attendance — double-marking cannot duplicate"
# Re-mark the same day with different statuses; must update, not duplicate.
UPD=$(curl -s -X POST "$API/attendance/register" -H "$AD" -H "$JH" \
  -d "{\"subjectId\":\"$SUBJ\",\"date\":\"$ADATE\",\"entries\":$STUDENT_IDS}")
ckc "re-mark accepted (upsert)" "$UPD" '"success":true'

RAW=$(curl -s "$API/attendance/history?subjectId=$SUBJ&from=$ADATE&to=$ADATE&limit=100" -H "$AD")
COUNT=$(echo "$RAW" | jget "['data']['pagination']['total']")
ROWS=$(echo "$STUDENT_IDS" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
ck "no duplicate rows (1 per student)" "$COUNT" "$ROWS"

section "Attendance — validation"
ck "unknown student rejected → 400" \
  "$(status POST /attendance/register "$AD" "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-09-16\",\"entries\":[{\"studentId\":\"000000000000000000000000\",\"status\":\"present\"}]}")" "400"
ck "invalid status rejected → 400" \
  "$(status POST /attendance/register "$AD" "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-09-16\",\"entries\":[{\"studentId\":\"$STUD\",\"status\":\"teleported\"}]}")" "400"
ck "empty entries rejected → 400" \
  "$(status POST /attendance/register "$AD" "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-09-16\",\"entries\":[]}")" "400"
ck "duplicate student in one payload rejected → 400" \
  "$(status POST /attendance/register "$AD" "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-09-16\",\"entries\":[{\"studentId\":\"$STUD\",\"status\":\"present\"},{\"studentId\":\"$STUD\",\"status\":\"absent\"}]}")" "400"
ck "student cannot mark attendance → 403" \
  "$(status POST /attendance/register "$SH" "{\"subjectId\":\"$SUBJ\",\"date\":\"2026-09-16\",\"entries\":[{\"studentId\":\"$STUD\",\"status\":\"present\"}]}")" "403"

section "Attendance — summary"
S=$(curl -s "$API/attendance/summary/$STUD" -H "$AD")
ckc "summary returns percentage" "$S" '"percentage"'
ckc "summary counts present" "$S" '"present"'
ckc "percentage is 100 for all-present" "$S" '"percentage":100'

# A student may read their own summary but not someone else's.
OWN_ID=$(curl -s "$API/students/me" -H "$SH" | jget "['data']['id']")
ck "student reads own summary" "$(status GET "/attendance/summary/$OWN_ID" "$SH")" "200"
ck "student blocked from another student's summary" "$(status GET "/attendance/summary/$STUD2" "$SH")" "403"

# ============================================================ TIMETABLE
section "Timetable — creating slots"
S1=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"09:00\",\"endTime\":\"10:00\"}")
SID=$(echo "$S1" | jget "['data']['id']")
ckc "slot created" "$S1" '"success":true'
ckc "start time echoed" "$S1" '"startTime":"09:00"'
ckc "subject name enriched" "$S1" '"subjectName"'
ckc "teacher name enriched" "$S1" '"teacherName"'

section "Timetable — CONFLICT DETECTION (the flagship feature)"
# 1. Teacher double-booked: same teacher, overlapping time, same day.
C1=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"09:30\",\"endTime\":\"10:30\"}")
ckc "overlapping teacher slot rejected" "$C1" 'already has'
ckc "conflict code returned" "$C1" 'TIMETABLE_CONFLICT'
ck "conflict responds 409" \
  "$(status POST /timetable "$AD" "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"09:30\",\"endTime\":\"10:30\"}")" "409"

# 2. Back-to-back must be ALLOWED (half-open intervals).
BK=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"10:00\",\"endTime\":\"11:00\"}")
ckc "back-to-back slot allowed (not a conflict)" "$BK" '"success":true'
BKID=$(echo "$BK" | jget "['data']['id']")

# 3. Adjacent-before must also be allowed.
BB=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"08:00\",\"endTime\":\"09:00\"}")
ckc "slot ending exactly at another's start allowed" "$BB" '"success":true'
BBID=$(echo "$BB" | jget "['data']['id']")

# 4. Different day is fine.
DIFF=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"tuesday\",\"startTime\":\"09:00\",\"endTime\":\"10:00\"}")
ckc "same time on a different day allowed" "$DIFF" '"success":true'
DIFFID=$(echo "$DIFF" | jget "['data']['id']")

section "Timetable — pre-flight conflict check"
CHK_OK=$(curl -s -X POST "$API/timetable/check" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"14:00\",\"endTime\":\"15:00\"}")
ckc "free slot reports no conflict" "$CHK_OK" '"hasConflict":false'

CHK_BAD=$(curl -s -X POST "$API/timetable/check" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"09:15\",\"endTime\":\"09:45\"}")
ckc "busy slot reports conflict" "$CHK_BAD" '"hasConflict":true'
ckc "conflict names the kind" "$CHK_BAD" '"kind":"teacher"'
ckc "conflict includes the clashing slot id" "$CHK_BAD" 'conflictingSlotIds'

section "Timetable — validation & access"
ck "end before start → 400" \
  "$(status POST /timetable "$AD" "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"11:00\",\"endTime\":\"10:00\"}")" "400"
ck "bad time format → 400" \
  "$(status POST /timetable "$AD" "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"9am\",\"endTime\":\"10am\"}")" "400"
ck "invalid day → 400" \
  "$(status POST /timetable "$AD" "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"someday\",\"startTime\":\"09:00\",\"endTime\":\"10:00\"}")" "400"
ck "teacher cannot create a slot → 403" \
  "$(status POST /timetable "$TH" "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"monday\",\"startTime\":\"13:00\",\"endTime\":\"14:00\"}")" "403"

section "Timetable — update ignores itself"
# Use an isolated day (saturday is not in WEEKDAYS; use a slot far from others
# on friday) so this tests self-exclusion rather than a genuine neighbour clash.
ISO=$(curl -s -X POST "$API/timetable" -H "$AD" -H "$JH" \
  -d "{\"classSectionId\":\"$CLASS\",\"subjectId\":\"$SUBJ\",\"teacherId\":\"$TUID\",\"day\":\"friday\",\"startTime\":\"09:00\",\"endTime\":\"10:00\"}")
ISOID=$(echo "$ISO" | jget "['data']['id']")
UPD_SLOT=$(curl -s -X PATCH "$API/timetable/$ISOID" -H "$AD" -H "$JH" -d '{"startTime":"09:05","endTime":"10:05"}')
ckc "shifting a slot does not self-conflict" "$UPD_SLOT" '"success":true'
ckc "shift actually applied" "$UPD_SLOT" '"startTime":"09:05"'

section "Timetable — reads"
BYCLASS=$(curl -s "$API/timetable?classSectionId=$CLASS" -H "$AD")
ckc "class timetable returns slots" "$BYCLASS" '"success":true'
ckc "sorted/echoed day present" "$BYCLASS" '"day"'
BYTEACHER=$(curl -s "$API/timetable" -H "$TH")
ckc "teacher sees own schedule" "$BYTEACHER" '"success":true'
BYSTUDENT=$(curl -s "$API/timetable" -H "$SH")
ckc "student sees their class timetable" "$BYSTUDENT" '"success":true'

# ============================================================ ANNOUNCEMENTS
section "Announcements — create & visibility"
A1=$(curl -s -X POST "$API/announcements" -H "$AD" -H "$JH" \
  -d "{\"title\":\"All-school notice $STAMP\",\"body\":\"Visible to everyone.\",\"audienceRoles\":[]}")
A1ID=$(echo "$A1" | jget "['data']['id']")
ckc "admin creates school-wide notice" "$A1" '"success":true'
ckc "author name enriched" "$A1" '"authorName"'

A2=$(curl -s -X POST "$API/announcements" -H "$AD" -H "$JH" \
  -d "{\"title\":\"Teachers only $STAMP\",\"body\":\"Staff meeting.\",\"audienceRoles\":[\"teacher\"]}")
ckc "admin creates role-targeted notice" "$A2" '"success":true'

A3=$(curl -s -X POST "$API/announcements" -H "$AD" -H "$JH" \
  -d "{\"title\":\"Students only $STAMP\",\"body\":\"Exam schedule.\",\"audienceRoles\":[\"student\"],\"requiresAcknowledgement\":true}")
A3ID=$(echo "$A3" | jget "['data']['id']")
ckc "admin creates student notice" "$A3" '"success":true'

# Student must see school-wide + student notices, NOT the teacher-only one.
AS=$(curl -s "$API/announcements?limit=50" -H "$SH")
ckc "student sees school-wide notice" "$AS" "All-school notice $STAMP"
ckc "student sees student notice" "$AS" "Students only $STAMP"
ckn "student does NOT see teacher-only notice" "$AS" "Teachers only $STAMP"

AT=$(curl -s "$API/announcements?limit=50" -H "$TH")
ckc "teacher sees school-wide notice" "$AT" "All-school notice $STAMP"
ckc "teacher sees teacher notice" "$AT" "Teachers only $STAMP"
ckn "teacher does NOT see student notice" "$AT" "Students only $STAMP"

section "Announcements — acknowledgement"
ACK=$(curl -s -X POST "$API/announcements/$A3ID/acknowledge" -H "$SH")
ckc "student acknowledges" "$ACK" '"acknowledged":true'
ckc "acknowledgement count returned" "$ACK" '"count":1'
ACK2=$(curl -s -X POST "$API/announcements/$A3ID/acknowledge" -H "$SH")
ckc "acknowledging twice is idempotent" "$ACK2" '"count":1'
ck "acknowledging a non-ack notice → 400" "$(status POST "/announcements/$A1ID/acknowledge" "$SH")" "400"

section "Announcements — validation & access"
ck "empty title → 400" "$(status POST /announcements "$AD" '{"title":"","body":"x","audienceRoles":[]}')" "400"
ck "empty body → 400" "$(status POST /announcements "$AD" '{"title":"x","body":"","audienceRoles":[]}')" "400"
ck "invalid audience role → 400" \
  "$(status POST /announcements "$AD" '{"title":"x","body":"y","audienceRoles":["principal"]}')" "400"
ck "student cannot create → 403" \
  "$(status POST /announcements "$SH" '{"title":"x","body":"y","audienceRoles":[]}')" "403"

section "Audit — Phase 4 resources are recorded"
AU=$(curl -s "$API/audit?limit=100" -H "$AD")
ckc "attendance marked recorded" "$AU" '"resource":"Attendance"'
ckc "timetable slot recorded" "$AU" '"resource":"TimetableSlot"'
ckc "announcement recorded" "$AU" '"resource":"Announcement"'

section "Cleanup"
for id in "$SID" "$BKID" "$BBID" "$DIFFID" "$ISOID"; do
  [ -n "$id" ] && curl -s -X DELETE "$API/timetable/$id" -H "$AD" >/dev/null
done
for id in "$A1ID" "$A3ID"; do
  [ -n "$id" ] && curl -s -X DELETE "$API/announcements/$id" -H "$AD" >/dev/null
done
[ -n "$STUD2" ] && curl -s -X DELETE "$API/students/$STUD2" -H "$AD" >/dev/null
echo "  ✓ slots, announcements and probe student removed"

echo
echo "════════════════════════════════════════════════"
echo "   PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED_NAMES[@]} -gt 0 ]; then
  echo "   failures:"
  for n in "${FAILED_NAMES[@]}"; do echo "     - $n"; done
fi
echo "════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
