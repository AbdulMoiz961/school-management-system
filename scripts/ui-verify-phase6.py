#!/usr/bin/env python3
"""Phase 6 UI smoke test: fees + dashboard."""
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

    def go(path, w=4000):
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

    print("\n=== ADMIN: dashboard ===")
    login("admin@scholaris.dev", "Password123")
    go("/", 5000)
    t = body()
    chk("dashboard loads", "Welcome back" in t)
    chk("shows stat cards", all(x in t for x in ["Students", "Teachers", "Classes", "Subjects"]))
    chk("shows attendance metric", "Attendance" in t)
    chk("shows fee metric", "Fees" in t)
    chk("shows at-risk section", "At-risk students" in t)
    chk("shows recent activity", "Recent activity" in t)
    pg.screenshot(path="/tmp/p6-dashboard.png")

    print("\n=== ADMIN: fees ===")
    go("/fees")
    t = body()
    chk("fees page loads", "Fees" in t)
    chk("has create button", "New invoice" in t)

    print("\n=== STUDENT: fees ===")
    logout()
    login("student@scholaris.dev", "Password123")
    go("/fees")
    t = body()
    chk("student sees own fees", "My fees" in t)
    chk("student cannot create invoice", "New invoice" not in t)

    print("\n=== STUDENT: dashboard ===")
    go("/")
    t = body()
    chk("student dashboard loads", "Welcome back" in t)
    chk("student dashboard scoped", "Recent activity" in t)

    b.close()

print(f"\n{'=' * 48}\n   PASSED: {PASS}    FAILED: {FAIL}\n{'=' * 48}")
sys.exit(0 if FAIL == 0 else 1)
