"use client";
import { useCallback, useEffect, useState } from "react";
import Markdown from "@/components/markdown";

type Item = { rel: string; name: string; mtime: number };

export default function ResearchPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [meta, setMeta] = useState<{ title: string; source: string; rel: string } | null>(null);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [daily, setDaily] = useState("");

  const loadList = useCallback(() => {
    fetch("/api/research/list")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {});
  }, []);
  useEffect(loadList, [loadList]);

  const isUrl = /^https?:\/\//i.test(input.trim());

  async function run() {
    if (!input.trim()) return;
    setBusy(true);
    setErr("");
    setResult("");
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { url: input.trim() } : { text: input.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Research lỗi");
      setResult(d.markdown || "");
      setMeta({ title: d.title || "", source: d.source || "", rel: d.rel || "" });
      loadList();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function scrape(kind: "github-day" | "github-month" | "reddit") {
    setBusy(true);
    setErr("");
    setDaily("");
    setResult("");
    try {
      const r = await fetch("/api/research/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Cào lỗi");
      setResult(d.markdown || "");
      setMeta({ title: d.title || "", source: d.source || "", rel: d.rel || "" });
      loadList();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runDaily() {
    setBusy(true);
    setDaily("");
    setErr("");
    try {
      const r = await fetch("/api/research/daily", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Daily lỗi");
      const c = d.counts || { videos: 0, news: 0, repos: 0 };
      setDaily(
        d.skipped
          ? d.reason === "nothing-new"
            ? "Hôm nay chưa có gì mới"
            : `Hôm nay đã chạy rồi (${d.rel})`
          : `Xong: ${c.videos} video · ${c.news} tin · ${c.repos} repo mới`
      );
      setMeta(null);
      setResult(d.report || "");
      loadList();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(rel: string) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/research/list?id=${encodeURIComponent(rel)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không mở được");
      setMeta(null);
      setResult(d.content || "");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Research</h1>
        <p className="text-sm text-muted mt-0.5">
          Dán link YouTube / GitHub / bài viết (hoặc nội dung) → tóm tắt + thu thập thêm nguồn qua WebSearch. Báo cáo lưu trong research/ và được mirror sang Obsidian nếu bạn đã cấu hình.
        </p>
      </div>

      <div className="card p-5 grid gap-3">
        <textarea
          className="textarea"
          rows={3}
          placeholder="Dán link YouTube / Facebook / bài viết — hoặc dán nội dung cần research…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={run}>
            {busy ? "Đang research… (~30-120s)" : isUrl ? "Research link" : "Research nội dung"}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={runDaily}>
            Chạy daily ngay
          </button>
          {daily && <span className="text-sm text-muted">{daily}</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap border-t border-line pt-3">
          <span className="text-sm text-muted mr-1">Cào nhanh:</span>
          <button className="btn btn-ghost !py-1.5 !text-sm" disabled={busy} onClick={() => scrape("github-day")}>
            🐙 GitHub top ngày
          </button>
          <button className="btn btn-ghost !py-1.5 !text-sm" disabled={busy} onClick={() => scrape("github-month")}>
            🐙 GitHub top tháng
          </button>
          <button className="btn btn-ghost !py-1.5 !text-sm" disabled={busy} onClick={() => scrape("reddit")}>
            👽 Reddit AI/Claude
          </button>
        </div>
        {err && <p className="text-brand text-sm">{err}</p>}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="card p-5 min-h-40">
          {result ? (
            <div>
              {meta && (meta.title || meta.source || meta.rel) && (
                <div className="mb-3 pb-3 border-b border-line grid gap-1">
                  {meta.title && <h2 className="text-lg font-bold text-ink">{meta.title}</h2>}
                  {meta.source && (
                    <p className="text-sm text-muted">
                      Nguồn:{" "}
                      <a
                        href={meta.source}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:underline break-all"
                      >
                        {meta.source}
                      </a>
                    </p>
                  )}
                  {meta.rel && <p className="text-xs text-muted">File: {meta.rel}</p>}
                </div>
              )}
              <Markdown>{result}</Markdown>
            </div>
          ) : (
            <p className="text-muted text-sm">Kết quả research hiện ở đây.</p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label mb-0">Đã lưu (research/)</span>
            <button className="btn btn-ghost !py-1 !text-xs" onClick={loadList}>
              Tải lại
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-muted text-sm">Chưa có.</p>
          ) : (
            <div className="grid gap-1 max-h-[60vh] overflow-auto">
              {items.map((it) => (
                <button
                  key={it.rel}
                  onClick={() => open(it.rel)}
                  className="text-left text-sm text-ink hover:text-brand px-2 py-1.5 rounded hover:bg-canvas truncate"
                  title={it.rel}
                >
                  {it.rel.startsWith("daily/") ? "📅 " : "🔎 "}
                  {it.name.replace(/\.md$/, "")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
