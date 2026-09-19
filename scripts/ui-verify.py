#!/usr/bin/env python3
"""
Full UI verification for the School Management System.

Usage:
    python3 scripts/ui-verify.py [base_url]

Defaults to http://localhost:5173 (the Vite dev server).

Requires the API to be running on :5000 and the client to be reachable at the
given base URL. Uses the seeded demo accounts.
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
PASS = FAIL = 0

ADMIN = ("admin@scholaris.dev", "Password123")
TEACHER = ("teacher@scholaris.dev", "Password123")
# `npm run seed` links a Student profile to this login, so the self-service
# flow is exercisable. Do not point this at a fixture created by api-verify.sh —
# `npm run clean:test` removes those.
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
        ctx = browser.new_context(viewport={"width": 1440, "height": 950})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.set_default_timeout(45000)

        def go(path, settle=3000):
            pg.goto(BASE + path, wait_until="commit", timeout=45000)
            pg.wait_for_timeout(settle)

        def login(email, password):
            go("/login", 3000)
            pg.fill("#email", email)
            pg.fill("#password", password)
            pg.click("button[type=submit]")
            pg.wait_for_timeout(5500)

        def logout():
            pg.click("button[aria-label='Sign out']")
            pg.wait_for_timeout(4500)

        # ---------------------------------------------------------- ADMIN
        print("\n=== ADMIN ===")
        login(*ADMIN)
        chk("logged in", "Welcome back" in pg.inner_text("body"), f"({pg.url})")

        nav = pg.evaluate(
            "Array.from(document.querySelectorAll('aside nav a')).map(a=>a.textContent.trim())"
        )
        print("      nav:", nav)
        for item in ["Academic Terms", "Classes", "Students", "Teachers", "Subjects", "Audit Log"]:
            chk(f"nav has '{item}'", item in nav)

        print("\n[terms] page + create through the form")
        go("/terms", 3500)
        chk("heading", "Academic terms" in pg.inner_text("body"))
        chk("table renders", pg.query_selector("table") is not None)
        pg.click("text=New term")
        pg.wait_for_timeout(1000)
        chk("modal opens", "New academic term" in pg.inner_text("body"))
        stamp = str(int(time.time()))[-6:]
        pg.fill("input[placeholder='e.g. Fall Semester']", f"Verify {stamp}")
        pg.fill("input[placeholder='2026-2027']", "2032-2033")
        pg.fill("input[type=date] >> nth=0", "2032-09-01")
        pg.fill("input[type=date] >> nth=1", "2032-12-20")
        pg.click("text=Create term")
        pg.wait_for_timeout(4500)
        chk("term created", f"Verify {stamp}" in pg.inner_text("body"))

        print("\n[pages] each module renders")
        for path, expect in [
            ("/classes", "Classes & sections"),
            ("/students", "Students"),
            ("/teachers", "Teachers"),
            ("/subjects", "Subjects"),
            ("/audit", "Audit log"),
            ("/profile", "Display name"),
        ]:
            go(path, 3200)
            chk(f"{path}", expect in pg.inner_text("body"))

        print("\n[audit] recorded our new term")
        go("/audit", 4000)
        chk("shows new term", f"Verify {stamp}" in pg.inner_text("body"))
        chk("shows actor", "admin@scholaris.dev" in pg.inner_text("body"))

        # -------------------------------------------------------- TEACHER
        print("\n=== TEACHER ===")
        logout()
        login(*TEACHER)
        chk("logged in", "Welcome back" in pg.inner_text("body"), f"({pg.url})")
        tnav = pg.evaluate(
            "Array.from(document.querySelectorAll('aside nav a')).map(a=>a.textContent.trim())"
        )
        print("      nav:", tnav)
        chk("teacher sees Classes", "Classes" in tnav)
        chk("teacher blocked from Teachers", "Teachers" not in tnav)
        chk("teacher blocked from Audit", "Audit Log" not in tnav)

        go("/teachers", 3500)
        chk("/teachers denied", "Access denied" in pg.inner_text("body"))
        go("/students", 3500)
        body = pg.inner_text("body")
        chk("/students allowed", "Students" in body and "Access denied" not in body)

        # -------------------------------------------------------- STUDENT
        print("\n=== STUDENT ===")
        logout()
        login(*STUDENT)
        chk("logged in", "Welcome back" in pg.inner_text("body"), f"({pg.url})")
        snav = pg.evaluate(
            "Array.from(document.querySelectorAll('aside nav a')).map(a=>a.textContent.trim())"
        )
        print("      nav:", snav)
        chk("'My Profile' label", "My Profile" in snav)
        chk("no Teachers", "Teachers" not in snav)
        chk("no Audit Log", "Audit Log" not in snav)
        chk("no Classes", "Classes" not in snav)

        go("/students", 4500)
        body = pg.inner_text("body")
        chk("self-service profile", "STU-" in body)
        chk("has edit button", "Edit contact details" in body)
        chk("no admin create button", "New student" not in body)

        print("\n[student] edits own contact details")
        pg.click("text=Edit contact details")
        pg.wait_for_timeout(1200)
        chk("edit form opens", "Save changes" in pg.inner_text("body"))
        pg.fill("input[placeholder='+92 300 0000000'] >> nth=0", f"+92 300 {stamp[:7]}")
        pg.click("text=Save changes")
        pg.wait_for_timeout(4500)
        chk("change persisted", f"+92 300 {stamp[:7]}" in pg.inner_text("body"))

        go("/audit", 3500)
        chk("/audit denied", "Access denied" in pg.inner_text("body"))

        browser.close()

    print(f"\n{'=' * 50}\n   PASSED: {PASS}    FAILED: {FAIL}\n{'=' * 50}")
    if errs:
        print("uncaught page errors:")
        for e in errs[:8]:
            print("   !", e[:150])
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
