"""Send a message (text + images + video) to a Zalo group via the zalo-relay service.

Truoc day script nay mo Chromium vao chat.zalo.me. Da bo, vi Zalo chi giu 1 phien
web moi tai khoan: chay song song voi luong outreach dung chung so thi hai ben da
phien nhau lien tuc. Gio ca hai di chung mot phien do relay giu. KHONG quay lai Playwright.

Relay: chay tren VPS rieng tai /opt/zalo-relay, systemd unit "zalo-relay".
Port 3131 chi bind 127.0.0.1 tren VPS, app (lib/group-post.ts) tu mo SSH tunnel:
  ssh -N -i $ZALO_RELAY_SSH_KEY -L 3131:127.0.0.1:3131 $ZALO_RELAY_SSH_HOST

Config qua bien moi truong:
  ZALO_RELAY_URL     mac dinh http://127.0.0.1:3131
  ZALO_RELAY_SECRET  phai khop RELAY_SECRET trong .env cua relay
  ZALO_RELAY_SSH_HOST   user@ip cua VPS chay relay
  ZALO_RELAY_SSH_KEY    duong dan private key de mo tunnel

Usage:
  python zalo_group.py --groups                     # liet ke group relay nhin thay
  python zalo_group.py --group "Ten group" --text "..." [--image a.jpg ...] [--video v.mp4]
  python zalo_group.py --job job.json
"""
import argparse
import base64
import json
import os
import urllib.error
import urllib.request

import common

RELAY_URL = os.environ.get("ZALO_RELAY_URL", "http://127.0.0.1:3131").rstrip("/")
RELAY_SECRET = os.environ.get("ZALO_RELAY_SECRET", "")
TIMEOUT = 600  # video base64 qua tunnel cham
MAX_VIDEO_BYTES = 60 * 1024 * 1024


def _call(method, path, payload=None):
    """Goi relay, tra ve dict. Nem RuntimeError kem thong tin doc duoc."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(RELAY_URL + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if RELAY_SECRET:
        req.add_header("x-secret", RELAY_SECRET)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"relay HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"khong ket noi duoc relay {RELAY_URL}: {e.reason}")


def _encode_files(paths):
    """File nam tren may nay, relay nam tren VPS: gui kem base64 chu khong gui duong dan.
    Relay ghi tung entry ra tmp roi dua vao attachments cua zca-js, mp4 di cung duong voi anh."""
    out = []
    for p in paths:
        with open(p, "rb") as f:
            out.append({"name": os.path.basename(p), "data_b64": base64.b64encode(f.read()).decode("ascii")})
    return out


def send_one(group_name, text, images, video=None):
    files = list(images or [])
    if video:
        try:
            size = os.path.getsize(video)
        except OSError as e:
            return {"group": group_name, "status": "error", "error": f"khong doc duoc video: {e}"}
        if size > MAX_VIDEO_BYTES:
            return {"group": group_name, "status": "error",
                    "error": f"video {size // (1024 * 1024)}MB qua 60MB, relay khong nhan"}
        files.append(video)
    try:
        res = _call("POST", "/send-group", {
            "group": group_name,
            "text": text,
            "images": _encode_files(files),
        })
    except (RuntimeError, OSError) as e:
        return {"group": group_name, "status": "error", "error": str(e)}

    if not res.get("ok"):
        return {"group": group_name, "status": "error", "error": res.get("error", "loi khong ro")}
    return {"group": group_name, "status": "ok"}


def run_job(job):
    text = job.get("text", "")
    images = job.get("images", [])
    video = job.get("video")
    targets = job.get("targets", [])
    delay = job.get("delay_seconds", 15)

    results = []
    for i, name in enumerate(targets):
        r = send_one(name, text, images, video)
        results.append(r)
        common.log(action="send", **r)
        if i < len(targets) - 1:
            common.human_delay(delay)

    ok = sum(1 for r in results if r["status"] == "ok")
    common.log(action="summary", platform="zalo", ok=ok, total=len(results), results=results)


def list_groups():
    try:
        res = _call("GET", "/groups")
    except (RuntimeError, OSError) as e:
        common.die(str(e))
    for name, gid in sorted(res.get("groups", {}).items()):
        print(f"{gid}  {name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true")
    ap.add_argument("--groups", action="store_true")
    ap.add_argument("--group")
    ap.add_argument("--text", default="")
    ap.add_argument("--image", action="append", default=[])
    ap.add_argument("--video")
    ap.add_argument("--job")
    args = ap.parse_args()

    if args.login:
        common.die("Zalo dang nhap o relay, khong phai o day. Relay mat phien thi tu ban QR ve Telegram.")

    if args.groups:
        list_groups()
        return

    if args.job:
        with open(args.job, encoding="utf-8") as f:
            run_job(json.load(f))
        return

    if not args.group:
        common.die("thieu --group hoac --job")
    run_job({"text": args.text, "images": args.image, "video": args.video,
             "targets": [args.group], "delay_seconds": 0})


if __name__ == "__main__":
    main()
