"use client";
import { useState } from "react";
import PostsBrowser from "@/components/posts-browser";
import CreateFlow from "@/components/create/create-flow";

const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
];

export default function ShortsTypePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div>
      <PostsBrowser
        fixedType="short"
        title="Shorts"
        subtitle="Video ngắn, đăng Facebook + Instagram + TikTok + YouTube (qua Zernio)"
        platformOptions={PLATFORMS}
        reloadKey={reloadKey}
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Tạo Short
          </button>
        }
      />
      <CreateFlow
        open={showCreate}
        initialType="short"
        onClose={() => setShowCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
