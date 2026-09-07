"""Entry duy nhat cho app content-agent (lib/group-post.ts): dang caption + anh/video len group FB va group Zalo.

  python publish.py --job job.json
      job = {text, zalo_text, images[], video, fb_targets[], zalo_targets[], fb_delay, zalo_delay, dry_run}
      text = caption dang FB (kem video neu co) · zalo_text = caption + link YouTube, Zalo KHONG gui video
      dry_run = duong dan .png: FB lam het buoc nhung khong bam Dang (test), Zalo bo qua
  python publish.py --login fb
      mo Chrome headed de dang nhap lai Facebook (cho toi da 5 phut)

Stdout: JSON theo dong (tien do tung group), dong CUOI luon la tong ket
  {"fbgroup": {...}, "zalogroup": {...}}   (chi co key cua platform co target)
moi value: {status: "ok"|"failed", reason?, ok, total, results[]}. App doc dong cuoi nay.
"""
import argparse
import json
import sys
import traceback

import common

# San delay giua cac group. Ep o day, khong tin caller: dang lien tuc la FB tam khoa dang bai.
FB_MIN_DELAY = 30
ZALO_MIN_DELAY = 15


def _summ(results, reason=None):
    total = len(results)
    ok = sum(1 for r in results if r.get("status") == "ok")
    if reason:
        return {"status": "failed", "reason": reason, "ok": ok, "total": total, "results": results}
    if total and ok == total:
        return {"status": "ok", "ok": ok, "total": total, "results": results}
    first = next((r.get("error") for r in results if r.get("status") != "ok"), "lỗi không rõ")
    return {"status": "failed", "reason": f"{ok}/{total} group ok, lỗi: {first}",
            "ok": ok, "total": total, "results": results}


def run_zalo(job):
    import zalo_group

    targets = job.get("zalo_targets") or []
    delay = max(ZALO_MIN_DELAY, int(job.get("zalo_delay") or 0))
    results = []
    for i, name in enumerate(targets):
        # Zalo: text + link YouTube, KHONG gui file video (Thanh chot 04/09).
        r = zalo_group.send_one(name, job.get("zalo_text") or job.get("text", ""), job.get("images") or [], None)
        results.append(r)
        common.log(action="send", platform="zalo", **r)
        if i < len(targets) - 1:
            common.human_delay(delay)
    return _summ(results)


def run_fb(job):
    import fb_group

    targets = job.get("fb_targets") or []
    delay = max(FB_MIN_DELAY, int(job.get("fb_delay") or 0))
    results = []
    # LUON headed: headless bi FB gan co, phien chet nhanh hon nhieu.
    with common.Session("fb", headed=True) as s:
        if not common.is_logged_in(s.page, "fb"):
            return _summ([], reason="chưa đăng nhập Facebook, bấm 'Đăng nhập lại Facebook' trong Settings")
        for i, url in enumerate(targets):
            r = fb_group.post_one(s.page, url, job.get("text", ""), job.get("images") or [], None,
                                  job.get("video"), job.get("dry_run"))
            results.append(r)
            common.log(action="post", platform="fb", **r)
            if i < len(targets) - 1:
                common.human_delay(delay)
    return _summ(results)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job")
    ap.add_argument("--login", choices=["fb"])
    args = ap.parse_args()

    if args.login:
        ok = common.interactive_login(args.login)
        sys.exit(0 if ok else 1)

    if not args.job:
        common.die("thieu --job hoac --login fb")

    with open(args.job, encoding="utf-8") as f:
        job = json.load(f)

    out = {}
    # Zalo truoc (vai giay, khong mo browser), FB sau. Moi platform boc rieng de cai nay loi khong keo cai kia.
    if job.get("zalo_targets") and not job.get("dry_run"):
        try:
            out["zalogroup"] = run_zalo(job)
        except Exception as e:
            traceback.print_exc()
            out["zalogroup"] = {"status": "failed", "reason": f"{type(e).__name__}: {e}"}
    if job.get("fb_targets"):
        try:
            out["fbgroup"] = run_fb(job)
        except Exception as e:
            traceback.print_exc()
            out["fbgroup"] = {"status": "failed", "reason": f"{type(e).__name__}: {e}"}

    print(json.dumps(out, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
