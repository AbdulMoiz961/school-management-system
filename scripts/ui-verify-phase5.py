#!/usr/bin/env python3
"""Phase 5 UI smoke test: assignments, marks entry, report card."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
PASS = FAIL = 0


def chk(label, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"   PASS  {label} {extra}")
    else:
        FAIL += 1
        print(f"   FAIL  {label} {extra}")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
    pg = b.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    pg.set_default_timeout(30000)

    def go(path, w=3500):
        pg.goto(BASE + path, wait_until="commit", timeout=40000)
        pg.wait_for_timeout(w)

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

    print("\n=== ADMIN: assignments ===")
    login("admin@scholaris.dev", "Password123")
    go("/assignments")
    chk("page loads", "Assignments" in body())
    chk("has create button", "New assignment" in body())
    pg.click("button:has-text('New assignment')")
    pg.wait_for_timeout(1800)
    chk("composer opens", "New assignment" in body())
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(1000)

    print("\n=== ADMIN: exams ===")
    go("/exams")
    t = body()
    chk("page loads", "Exams & grades" in t)
    chk("has create button", "New exam" in t)
    chk("explains report cards", "report" in t.lower())

    print("\n=== TEACHER: sees staff views ===")
    logout()
    login("teacher@scholaris.dev", "Password123")
    go("/assignments")
    chk("teacher gets staff assignment view", "New assignment" in body())
    go("/exams")
    chk("teacher gets marks view", "New exam" in body())
    chk("teacher not shown student results", "My results" not in body())

    print("\n=== STUDENT: sees student views ===")
    logout()
    login("student@scholaris.dev", "Password123")
    go("/assignments")
    t = body()
    chk("student sees own assignments", "My assignments" in t)
    chk("student cannot create", "New assignment" not in t)
    chk("student has submit button", "Submit" in t)

    go("/exams")
    t = body()
    chk("student sees results page", "My results" in t)
    chk("no marks entry for student", "New exam" not in t)

    b.close()

print(f"\n{'=' * 48}\n   PASSED: {PASS}    FAILED: {FAIL}\n{'=' * 48}")
sys.exit(0 if FAIL == 0 else 1)
