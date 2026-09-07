"""Post to Facebook group feeds (text + images + video) via a persistent Playwright session.

Usage:
  python fb_group.py --login
  python fb_group.py --group <url> --text "..." [--image a.jpg ...] [--video v.mp4] [--link https://...]
  python fb_group.py --job job.json
"""
import argparse
import json
import time

import common

# UI labels in Vietnamese + English (FB serves either depending on account locale).
COMPOSER_TRIGGER = [
    "Bạn viết gì đi", "Viết bài", "Bạn đang nghĩ gì",
    "Write something", "What's on your mind", "Create a public post",
]
PHOTO_BTN = ["Ảnh/video", "Ảnh/Video", "Photo/video", "Photo/Video"]
POST_BTN = ["Đăng", "Post"]

IMAGE_UPLOAD_TIMEOUT = 60
VIDEO_UPLOAD_TIMEOUT = 300


def _click_first_text(page, labels, timeout=8000):
    # Try button role first (most reliable), then fall back to visible text.
    for lbl in labels:
        btn = page.get_by_role("button", name=lbl, exact=False).first
        try:
            btn.wait_for(state="visible", timeout=timeout)
            btn.click()
            return True
        except Exception:
            pass
    for lbl in labels:
        loc = page.get_by_text(lbl, exact=False)
        try:
            vis = loc.filter(visible=True).first
            vis.wait_for(state="visible", timeout=3000)
            vis.click()
            return True
        except Exception:
            continue
    return False


def _post_button(dialog):
    """Nut Dang/Post ben trong dialog composer (khong phai nut ngoai feed)."""
    for lbl in POST_BTN:
        btn = dialog.get_by_role("button", name=lbl, exact=True).last
        try:
            if btn.count() > 0:
                return btn
        except Exception:
            continue
    return None


def _wait_attached(page, dialog, timeout_s):
    """Preview media da hien trong dialog chua (video player hoac anh blob:)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if dialog.locator("video, img[src^='blob:']").count() > 0:
                return True
        except Exception:
            pass
        page.wait_for_timeout(1000)
    return False


def _wait_media_ready(page, dialog, timeout_s):
    """Cho FB xu ly xong media da gan: het progress bar va nut Dang bam duoc.

    Ban cu cho cung 4s: du cho anh, nhung video thi FB con dang upload, bam Dang la mat bai.
    Doi 2 lan lien tiep deu ready de khong dinh khoang trong truoc khi progress bar kip hien.
    """
    deadline = time.time() + timeout_s
    streak = 0
    page.wait_for_timeout(3000)
    while time.time() < deadline:
        try:
            busy = dialog.locator("[role='progressbar']").count()
            btn = _post_button(dialog)
            ready = busy == 0 and btn is not None and btn.is_enabled()
        except Exception:
            ready = False
        streak = streak + 1 if ready else 0
        if streak >= 2:
            return True
        page.wait_for_timeout(2000)
    return False


def post_one(page, group_url, text, images, link, video=None, dry_run=None):
    """dry_run: duong dan .png -> lam het moi buoc (go text, up media, cho xong) nhung KHONG bam Dang,
    chup man hinh dialog roi tra ve. Dung de test tren group that ma khong dang bai."""
    page.goto(group_url, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)

    if not _click_first_text(page, COMPOSER_TRIGGER):
        return {"group": group_url, "status": "error", "error": "khong tim thay o soan bai"}

    # Wait for the composer dialog textbox.
    try:
        box = page.get_by_role("textbox").last
        box.wait_for(state="visible", timeout=8000)
    except Exception:
        return {"group": group_url, "status": "error", "error": "khong mo duoc composer"}

    dialog = page.get_by_role("dialog")

    body = text or ""
    if link:
        body = (body + "\n\n" + link).strip()
    if body:
        box.click()
        # Caption 1500+ ky tu: timeout mac dinh 30s cua type() khong du (da dinh TimeoutError 04/09).
        box.type(body, delay=12, timeout=max(60000, len(body) * 60))
        page.wait_for_timeout(2500)  # let link preview expand

    media = list(images or []) + ([video] if video else [])
    if media:
        # Moi thu PHAI tim trong dialog: ngoai feed cung co nut "Anh/video" cung ten, bam nham la FB mo
        # composer thu 2 rong (video vao dialog moi, caption ket lai dialog cu - da dinh 04/09).
        # Bam "Anh/video" TRONG dialog de mo panel, roi gan file vao input cua panel do. Input an san
        # trong dialog nhan file nhung FB khong hien preview (dry-run 2 04/09), nen sau khi gan phai
        # thay <video> hoac <img blob:> moi tinh la da gan.
        _click_first_text(dialog, PHOTO_BTN, timeout=4000)
        page.wait_for_timeout(1200)
        finput = dialog.locator("input[type='file'][accept*='video'], input[type='file'][accept*='image']").last
        try:
            if finput.count() == 0:
                finput = page.locator("input[type='file'][accept*='image']").last
            finput.set_input_files(media)
        except Exception as e:
            return {"group": group_url, "status": "error", "error": f"upload media loi: {e}"}
        if not _wait_attached(page, dialog, 30):
            return {"group": group_url, "status": "error", "error": "media khong gan duoc vao composer (khong thay preview)"}
        timeout_s = VIDEO_UPLOAD_TIMEOUT if video else IMAGE_UPLOAD_TIMEOUT
        if not _wait_media_ready(page, dialog, timeout_s):
            return {"group": group_url, "status": "error", "error": f"upload chua xong sau {timeout_s}s"}

    btn = _post_button(dialog)
    if dry_run:
        enabled = False
        media_count = -1
        try:
            enabled = btn is not None and btn.is_enabled()
            previews = dialog.locator("video, img[src^='blob:']")
            media_count = previews.count()
            if media_count > 0:
                previews.first.scroll_into_view_if_needed()  # preview nam duoi vung cuon cua text dai
                page.wait_for_timeout(600)
            page.screenshot(path=dry_run)
        except Exception:
            pass
        return {"group": group_url, "status": "ok", "dry_run": True, "post_enabled": enabled, "media_count": media_count}
    posted = False
    if btn is not None:
        try:
            btn.wait_for(state="visible", timeout=5000)
            if btn.is_enabled():
                btn.click()
                posted = True
        except Exception:
            pass
    if not posted:
        return {"group": group_url, "status": "error", "error": "khong bam duoc nut Dang"}

    # Dialog closing ~ post submitted.
    try:
        dialog.wait_for(state="hidden", timeout=120000 if video else 20000)
    except Exception:
        pass
    if video:
        # FB tiep tuc up video nen sau khi dong dialog; dong Chrome som la mat bai.
        deadline = time.time() + VIDEO_UPLOAD_TIMEOUT
        while time.time() < deadline:
            page.wait_for_timeout(3000)
            try:
                if page.locator("[role='progressbar']").count() == 0:
                    break
            except Exception:
                break
    page.wait_for_timeout(2000)
    return {"group": group_url, "status": "ok"}


def run_job(job, headless=False):
    text = job.get("text", "")
    images = job.get("images", [])
    video = job.get("video")
    link = job.get("link")
    targets = job.get("targets", [])
    delay = job.get("delay_seconds", 30)

    results = []
    with common.Session("fb", headed=not headless) as s:
        if not common.is_logged_in(s.page, "fb"):
            common.die("chua login FB. Chay: python fb_group.py --login")
        for i, url in enumerate(targets):
            r = post_one(s.page, url, text, images, link, video, job.get("dry_run"))
            results.append(r)
            common.log(action="post", **r)
            if i < len(targets) - 1:
                common.human_delay(delay)
    ok = sum(1 for r in results if r["status"] == "ok")
    common.log(action="summary", platform="fb", ok=ok, total=len(results), results=results)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true")
    ap.add_argument("--group")
    ap.add_argument("--text", default="")
    ap.add_argument("--image", action="append", default=[])
    ap.add_argument("--video")
    ap.add_argument("--link")
    ap.add_argument("--job")
    args = ap.parse_args()

    if args.login:
        common.interactive_login("fb")
        return

    if args.job:
        with open(args.job, encoding="utf-8") as f:
            job = json.load(f)
        run_job(job)
        return

    if not args.group:
        common.die("thieu --group hoac --job")
    run_job({
        "text": args.text, "images": args.image, "video": args.video, "link": args.link,
        "targets": [args.group], "delay_seconds": 0,
    })


if __name__ == "__main__":
    main()
