"""Shared helpers cho group_poster (Facebook qua Playwright, Zalo qua zalo-relay)."""
import json
import os
import random
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
# Profile Chromium giu phien FB. App (lib/group-post.ts) truyen GROUP_POSTER_PROFILES,
# chay tay thi mac dinh ./profiles. Chi duoc co MOT profile: 2 ban dung chung tai khoan la da cookie nhau.
PROFILES_DIR = os.environ.get("GROUP_POSTER_PROFILES") or os.path.join(HERE, "profiles")

# Signals that a platform session is already logged in.
LOGIN_URL = {
    "fb": "https://www.facebook.com/",
    "zalo": "https://chat.zalo.me/",
}

# Element that only renders once the session is live.
LOGIN_MARKER = {
    "fb": "[aria-label='Facebook'], [role='navigation']",
    "zalo": "#conv-list, [class*='conv-item']",
}


def log(**kwargs):
    """Print a JSON line so the caller (app / Claude) can parse the result."""
    print(json.dumps(kwargs, ensure_ascii=False), flush=True)


def profile_dir(platform):
    d = os.path.join(PROFILES_DIR, platform)
    os.makedirs(d, exist_ok=True)
    return d


def _state_path(platform):
    return os.path.join(PROFILES_DIR, f"{platform}_state.json")


def save_state(context, platform):
    """Snapshot cookies outside the profile. Only call once login is confirmed,
    so a logged-out run can never overwrite a good snapshot."""
    try:
        with open(_state_path(platform), "w", encoding="utf-8") as f:
            json.dump(context.storage_state(), f)
    except Exception:
        pass


def restore_state(context, platform):
    """Chromium drops session cookies from user_data_dir (playwright#36139), and
    Facebook's `xs` is a session cookie unless "keep me logged in" was ticked - so
    the profile alone loses the session. Re-add only what the profile is missing;
    never overwrite a cookie it still holds, which could be fresher (`xs` rotates).
    """
    path = _state_path(platform)
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            saved = json.load(f).get("cookies", [])
        have = {(c["name"], c.get("domain")) for c in context.cookies()}
        missing = [c for c in saved if (c["name"], c.get("domain")) not in have]
        if missing:
            context.add_cookies(missing)
    except Exception:
        pass


class Session:
    """Context manager: persistent Chromium context per platform. LUON headed."""

    def __init__(self, platform, headed=True, slow_mo=120):
        self.platform = platform
        self.headed = headed
        self.slow_mo = slow_mo
        self._pw = None
        self.context = None
        self.page = None

    def __enter__(self):
        # Imported here, not at module level: zalo_group.py uses this module but
        # goes through the relay, so it must not require Playwright.
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self.context = self._pw.chromium.launch_persistent_context(
            user_data_dir=profile_dir(self.platform),
            headless=not self.headed,
            slow_mo=self.slow_mo,
            viewport={"width": 1366, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        restore_state(self.context, self.platform)
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        return self

    def __exit__(self, *exc):
        try:
            self.context.close()
        finally:
            self._pw.stop()


def _click_continue(page):
    """FB soft-logout screen ("Continue as <name>"): one click resumes the session."""
    for lbl in ("Continue", "Tiếp tục"):
        btn = page.get_by_role("button", name=lbl, exact=False).first
        try:
            btn.wait_for(state="visible", timeout=1500)
            btn.click()
            return True
        except Exception:
            continue
    return False


def is_logged_in(page, platform, timeout=25):
    """Heuristic login check. Navigates to the platform home, then polls.

    Polls instead of checking once: Zalo renders its conversation list ~3.3s in,
    so a single check at 3s reported "not logged in" on a perfectly good session.
    """
    page.goto(LOGIN_URL[platform], wait_until="domcontentloaded")
    deadline = time.time() + timeout
    resumed = False
    while time.time() < deadline:
        page.wait_for_timeout(1000)
        if page.locator(LOGIN_MARKER[platform]).count() > 0:
            save_state(page.context, platform)  # refresh snapshot while session is good
            return True
        if platform == "fb":
            # A real logout (/login or a password prompt) is final - fail fast.
            if "login" in page.url or page.locator("input[type='password']").count() > 0:
                return False
            if not resumed:
                resumed = _click_continue(page)
    return False


def interactive_login(platform):
    """Open a headed browser and wait for the user to finish logging in."""
    with Session(platform, headed=True, slow_mo=0) as s:
        page = s.page
        page.goto(LOGIN_URL[platform], wait_until="domcontentloaded")
        how = "nhap email + mat khau, TICK 'Duy tri dang nhap'" if platform == "fb" else "quet QR bang app Zalo"
        print(f"[login] Trinh duyet da mo. Hay {how} de dang nhap {platform.upper()}.", flush=True)
        print("[login] Dang cho... (toi da 5 phut). Dung khi da vao xong.", flush=True)
        deadline = time.time() + 300
        while time.time() < deadline:
            page.wait_for_timeout(3000)
            if _login_marker(page, platform):
                page.wait_for_timeout(2000)  # let cookies/idb settle
                save_state(page.context, platform)
                log(status="ok", action="login", platform=platform)
                return True
        log(status="error", action="login", platform=platform, error="timeout waiting for login")
        return False


def _login_marker(page, platform):
    try:
        if platform == "fb":
            return "login" not in page.url and page.locator("[role='navigation']").count() > 0
        if platform == "zalo":
            return page.locator("#conv-list, [class*='conv-item']").count() > 0
    except Exception:
        return False
    return False


def human_delay(base_seconds):
    """Randomized delay around base_seconds (+/-40%)."""
    if base_seconds <= 0:
        return
    time.sleep(base_seconds * random.uniform(0.6, 1.4))


def die(msg):
    log(status="error", error=msg)
    sys.exit(1)
