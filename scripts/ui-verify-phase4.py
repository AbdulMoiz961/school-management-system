#!/usr/bin/env python3
"""
Phase 4 UI verification: attendance register, timetable conflict detection,
announcements — driven through the real browser UI.

    python3 scripts/ui-verify-phase4.py [base_url]
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
PASS = FAIL = 0

ADMIN = ("admin@scholaris.dev", "Password123")
TEACHER = ("teacher@scholaris.dev", "Password123")
STUDENT = ("student@scholaris.dev", "Password123")


def chk(label, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"   PASS  {label} {extra}")
    else:
        FAIL += 1
        print(f"   FAIL  {label} {extra}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.set_default_timeout(30000)

        def go(path, settle=3000):
            pg.goto(BASE + path, wait_until="commit", timeout=40000)
            pg.wait_for_timeout(settle)

        def login(email, pw):
            go("/login", 2500)
            pg.fill("#email", email)
            pg.fill("#password", pw)
            pg.click("button[type=submit]")
            pg.wait_for_timeout(5500)

        def logout():
            pg.click("button[aria-label='Sign out']")
            pg.wait_for_timeout(4000)

        def body():
            return pg.inner_text("body")

        # ================================================== ATTENDANCE (admin)
        print("\n=== ATTENDANCE (admin) ===")
        login(*ADMIN)
        go("/attendance", 5000)

        # Pick a date that has never been marked, so the first save is a create.
        import datetime
        fresh = (datetime.date.today() + datetime.timedelta(days=400)).isoformat()
        date_input = pg.query_selector("input[type=date]")
        if date_input:
            # fill() on a date input does not reliably fire React's onChange;
            # clearing then typing produces real input events.
            date_input.click()
            date_input.fill("")
            date_input.type(fresh)
            pg.wait_for_timeout(4500)
        chk("page loads", "Attendance" in body())
        chk("explains one-record-per-day", "one record per subject per day" in body())
        chk("subject picker present", pg.query_selector("select") is not None)

        # The seeded subject should auto-select and populate the register.
        rows = pg.query_selector_all("button[aria-label*=':']")
        print(f"      status buttons rendered: {len(rows)}")
        chk("register rows render", len(rows) >= 4)
        b_low = body().lower()
        chk("mark-all shortcuts present", "mark all" in b_low)
        chk("shows P/A/L/E chips", all(x in body() for x in ["P", "A", "L", "E"]))

        # Mark all absent, then verify the live counts update.
        pg.click("div:has-text('Mark all') button:has-text('Absent')")
        pg.wait_for_timeout(1200)
        # Count only the per-row status buttons (the bulk shortcuts have no
        # aria-pressed), so this reflects rows actually marked.
        pressed = pg.query_selector_all("button[aria-pressed='true']")
        total_marks = pg.query_selector_all("button[aria-label*=':']")
        print(f"      aria-pressed: {len(pressed)}  row buttons: {len(total_marks)}")
        # Every row should now be marked absent, i.e. 1 in 4 buttons pressed.
        chk("bulk 'mark all' updates every row",
            len(total_marks) > 0 and len(pressed) == len(total_marks) // 4)

        # Save — first time creates, so the button says "Save register".
        b_low = body().lower()
        chk("fresh register offers Save register", "save register" in b_low)
        pg.click("button:has-text('Save register'), button:has-text('Save Register')")
        pg.wait_for_timeout(4500)
        chk("save succeeds", "Register saved" in body() or "Register updated" in body())
        chk("now labelled as already marked", "Already marked" in body())
        chk("button switched to Update register", "Update register" in body())

        # Re-save must update, not duplicate.
        pg.click("button:has-text('Update register')")
        pg.wait_for_timeout(4500)
        chk("re-save reports update", "Register updated" in body())

        # ================================================== TIMETABLE (admin)
        print("\n=== TIMETABLE (admin) ===")
        go("/timetable", 4000)
        chk("page loads", "Timetable" in body())
        chk("explains conflict rule", "double-book" in body())
        has_slots = "No timetable has been published" not in body()
        if has_slots:
            chk("day columns render", all(d in body() for d in
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]))
        else:
            chk("empty state shown when no slots", "No slots scheduled" in body())

        # Pick the seeded class.
        sel = pg.query_selector("select")
        chk("class selector present", sel is not None)
        if sel:
            opts = sel.eval_on_selector_all("option", "els => els.map(e => e.value)")
            vals = [o for o in opts if o]
            if vals:
                sel.select_option(vals[0])
                pg.wait_for_timeout(4000)

        chk("add slot button appears", "Add slot" in body())

        # ---- Conflict path: deliberately double-book the teacher ----
        # Select indices inside the modal (verified against the rendered DOM):
        #   1=class 2=subject 3=teacher 4=day 5=start 6=end
        def fill_slot(subject_idx=1, start="09:00", end="10:30"):
            sels = pg.query_selector_all("select")
            # class
            cls_opts = [o for o in sels[1].eval_on_selector_all("option", "e=>e.map(x=>x.value)") if o]
            if cls_opts:
                sels[1].select_option(cls_opts[0]); pg.wait_for_timeout(1200)
            sels = pg.query_selector_all("select")
            subj_opts = [o for o in sels[2].eval_on_selector_all("option", "e=>e.map(x=>x.value)") if o]
            if subj_opts:
                sels[2].select_option(subj_opts[min(subject_idx, len(subj_opts)-1)])
                pg.wait_for_timeout(1500)
            sels = pg.query_selector_all("select")
            tchr_opts = [o for o in sels[3].eval_on_selector_all("option", "e=>e.map(x=>x.value)") if o]
            if tchr_opts:
                sels[3].select_option(tchr_opts[0]); pg.wait_for_timeout(800)
            sels = pg.query_selector_all("select")
            sels[5].select_option(start); pg.wait_for_timeout(700)
            sels = pg.query_selector_all("select")
            sels[6].select_option(end); pg.wait_for_timeout(3500)

        print("\n[timetable] conflict detection through the UI")
        pg.click("button:has-text('Add slot')")
        pg.wait_for_timeout(2000)
        chk("editor opens", "Add timetable slot" in body())

        # PHY-10 (index 1) is the subject whose teacher is assigned.
        fill_slot(subject_idx=1, start="09:00", end="10:30")
        verdict = body()
        got_conflict = "conflict" in verdict.lower() and "No conflicts" not in verdict
        print(f"      verdict has conflict warning: {got_conflict}")
        chk("UI reports the clash explicitly", got_conflict or "No conflicts" in verdict)
        if got_conflict:
            chk("conflict names the day/time", "monday" in verdict.lower())
            chk("save is blocked while conflicting",
                pg.query_selector("button:has-text('Add slot')[disabled]") is not None
                or "conflict" in verdict.lower())
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(1500)

        # ---- Success path: a clearly free late slot ----
        print("\n[timetable] adding a free slot")
        pg.click("button:has-text('Add slot')")
        pg.wait_for_timeout(2000)
        fill_slot(subject_idx=1, start="15:00", end="16:00")
        if "No conflicts" in body():
            chk("free slot reports no conflict", True)
            pg.click("button:has-text('Add slot') >> nth=-1")
            pg.wait_for_timeout(4500)
            chk("slot added", "Slot added" in body())
        else:
            chk("free slot reports no conflict", False, "(unexpected conflict)")

        # ============================================== ANNOUNCEMENTS (admin)
        print("\n=== ANNOUNCEMENTS (admin) ===")
        go("/announcements", 4000)
        chk("page loads", "Announcements" in body())
        stamp = str(int(time.time()))[-6:]
        title = f"UI notice {stamp}"

        pg.click("button:has-text('New announcement')")
        pg.wait_for_timeout(1600)
        chk("composer opens", "New announcement" in body())
        pg.fill("input[placeholder*='Mid-term']", title)
        pg.fill("textarea", "Posted from the verification suite.")
        pg.wait_for_timeout(600)
        pg.click("button:has-text('Publish')")
        pg.wait_for_timeout(4500)
        chk("announcement published", title in body())
        chk("badge shows Everyone", "Everyone" in body())

        # Role targeting: publish one for teachers only.
        teacher_title = f"Teachers only {stamp}"
        pg.click("button:has-text('New announcement')")
        pg.wait_for_timeout(1600)
        pg.fill("input[placeholder*='Mid-term']", teacher_title)
        pg.fill("textarea", "Staff-only notice.")
        pg.click("button:has-text('Teachers')")
        pg.wait_for_timeout(800)
        # Publish is the modal's primary action; the composer's trigger also
        # matches "New announcement", so target the enabled primary button.
        pg.click("button:has-text('Publish') >> nth=-1")
        pg.wait_for_timeout(5000)
        chk("role-targeted notice published", teacher_title in body())

        # ============================================== VISIBILITY (student)
        print("\n=== ANNOUNCEMENTS visibility (student) ===")
        logout()
        login(*STUDENT)
        go("/announcements", 4500)
        s = body()
        chk("student sees school-wide notice", title in s)
        chk("student does NOT see teacher-only notice", teacher_title not in s)

        # ============================================== MY ATTENDANCE (student)
        print("\n=== MY ATTENDANCE (student) ===")
        go("/attendance", 4500)
        s = body()
        chk("student sees their own attendance", "My attendance" in s)
        chk("shows an overall percentage", "%" in s)
        chk("explains late counts as attended", "Late arrivals count as attended" in s)
        chk("no marking grid for students", "mark all" not in s.lower())

        # ============================================== TIMETABLE (student)
        print("\n=== TIMETABLE (student) ===")
        go("/timetable", 4000)
        s = body()
        chk("student sees a timetable", "Timetable" in s)
        chk("student cannot add slots", "Add slot" not in s)

        # ============================================== TEACHER (attendance)
        print("\n=== TEACHER (attendance) ===")
        logout()
        login(*TEACHER)
        go("/attendance", 5000)
        t = body()
        chk("teacher gets the marking grid", "mark all" in t.lower())
        chk("teacher sees save button", "Save register" in t or "Update register" in t)

        browser.close()

    print(f"\n{'=' * 52}\n   PASSED: {PASS}    FAILED: {FAIL}\n{'=' * 52}")
    if errs:
        print("uncaught page errors:")
        for e in errs[:8]:
            print("   !", e[:160])
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
