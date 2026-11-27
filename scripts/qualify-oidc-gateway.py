"""Run with Python Playwright and Chromium against a dedicated pilot account."""
import argparse
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def qualify(context, origin, organization, role, timeout):
    url = origin + "/api/v1/operator-session"

    def session():
        response = context.request.get(url, max_redirects=0, fail_on_status_code=False)
        if response.status == 401:
            return None
        if response.status != 200 or "no-store" not in response.headers.get("cache-control", ""):
            raise RuntimeError("Expected an authenticated, uncached session response")
        data = response.json()
        if data.get("organization") != organization or data.get("role") != role:
            raise RuntimeError("Unexpected operator organization or role")
        expiry = data.get("expiresAt")
        if not isinstance(expiry, int) or expiry <= time.time():
            raise RuntimeError("Expected an unexpired API access token")
        return expiry

    if session() is not None:
        raise RuntimeError("Fresh browser context already has a session")
    page = context.new_page()
    page.goto(origin + "/")
    print("Complete gateway login in the browser. Keep the browser open.", flush=True)
    deadline = time.monotonic() + timeout
    expiry = None
    while expiry is None and time.monotonic() < deadline:
        expiry = session()
        if expiry is None:
            time.sleep(1)
    if expiry is None:
        raise RuntimeError("Login timed out")
    page.goto(origin + "/")
    page.get_by_role("heading", name="Compliance overview").wait_for()
    health = context.request.get(origin + "/api/collection-health", max_redirects=0)
    if health.status != 200 or not isinstance(health.json(), list):
        raise RuntimeError("Dashboard collection data unavailable after login")
    # Read through the gateway normally while the initial access token ages out.
    while time.monotonic() < deadline:
        current = session()
        if current is None:
            raise RuntimeError("Gateway lost the session before token renewal")
        if time.time() >= expiry and current > expiry:
            break
        time.sleep(2)
    else:
        raise RuntimeError("No renewed token verified after original expiry")
    page.get_by_role("link", name="Sign out", exact=True).click()
    print("Complete any gateway logout confirmation.", flush=True)
    logout_deadline = time.monotonic() + 60
    while session() is not None:
        if time.monotonic() >= logout_deadline:
            raise RuntimeError("Operator API still accessible after logout")
        time.sleep(1)
    if context.request.get(origin + "/api/collection-health", max_redirects=0).status != 401:
        raise RuntimeError("Dashboard collection API still accessible after logout")
    print("Verified gateway login, access after original token expiry, and logout.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin")
    parser.add_argument("organization")
    parser.add_argument("role", choices=["reviewer", "analyst"])
    parser.add_argument("--timeout", type=int, default=600, help="login and refresh budget in seconds")
    parser.add_argument("--chromium", help="optional Chromium executable")
    args = parser.parse_args()
    u = urlsplit(args.origin)
    if not u.hostname or u.username or u.password or u.path not in ("", "/") or u.query or u.fragment or not (
        u.scheme == "https" or u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1")
    ):
        parser.error("Use the gateway HTTPS origin, or HTTP on loopback for a fixture")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, executable_path=args.chromium)
        qualify(browser.new_context(), args.origin.rstrip("/"), args.organization, args.role, args.timeout)
        browser.close()
