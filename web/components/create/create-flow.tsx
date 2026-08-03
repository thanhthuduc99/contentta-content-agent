"use client";
import { useEffect, useState } from "react";
import LongForm from "./long-form";
import ShortForm from "./short-form";
import PostForm from "./post-form";

export type CreateType = "post" | "short" | "youtube";

const CARDS: { type: CreateType; icon: string; title: string; desc: string }[] = [
  {
    type: "post",
    icon: "✏️",
    title: "Post",
    desc: "Bài viết text + ảnh — từ video YouTube, nguồn chia sẻ, hoặc tự dán. Đăng Facebook (qua Zernio).",
  },
  {
    type: "short",
    icon: "🎬",
    title: "Short",
    desc: "Video ngắn — upload video đã edit để đăng. Đăng TikTok + YouTube (qua Zernio).",
  },
  {
    type: "youtube",
    icon: "📺",
    title: "Long",
    desc: "Video YouTube dài — AI viết script 20-25 phút hoặc dán script sẵn. Chỉ tạo script, không đăng qua app.",
  },
];

export default function CreateFlow({
  open,
  onClose,
  onCreated,
  initialType,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id?: string) => void;
  initialType?: CreateType;
}) {
  const [chosen, setChosen] = useState<CreateType | null>(initialType || null);

  // Reset khi đóng/mở
  useEffect(() => {
    if (open) setChosen(initialType || null);
  }, [open, initialType]);

  if (!open) return null;

  const title = !chosen
    ? "Tạo bài"
    : chosen === "post"
    ? "Tạo bài Post"
    : chosen === "short"
    ? "Tạo Short"
    : "Tạo video dài";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-xl font-bold text-ink">{title}</h2>
            {chosen && !initialType && (
              <button
                type="button"
                className="text-sm text-muted hover:text-brand mt-0.5"
                onClick={() => setChosen(null)}
              >
                ← Chọn loại khác
              </button>
            )}
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink text-2xl leading-none"
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {!chosen ? (
            <div className="grid sm:grid-cols-3 gap-4">
              {CARDS.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => setChosen(c.type)}
                  className="card !rounded-xl p-5 text-left hover:border-brand hover:shadow-sm transition group"
                >
                  <span className="text-3xl">{c.icon}</span>
                  <h3 className="text-lg font-bold text-ink mt-2 group-hover:text-brand transition">
                    {c.title}
                  </h3>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{c.desc}</p>
                </button>
              ))}
            </div>
          ) : chosen === "post" ? (
            <PostForm onClose={onClose} onCreated={onCreated} />
          ) : chosen === "short" ? (
            <ShortForm onClose={onClose} onCreated={onCreated} />
          ) : (
            <LongForm onClose={onClose} onCreated={onCreated} />
          )}
        </div>
      </div>
    </div>
  );
}
