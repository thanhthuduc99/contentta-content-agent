"use client";
import { useState } from "react";
import PostsBrowser from "@/components/posts-browser";
import CreateFlow from "@/components/create/create-flow";

const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
];

export default function PostTypePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div>
      <PostsBrowser
        fixedType="post"
        title="Post"
        subtitle="Bài viết text + ảnh, đăng Facebook + LinkedIn (qua Zernio)"
        platformOptions={PLATFORMS}
        reloadKey={reloadKey}
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Tạo bài Post
          </button>
        }
      />
      <CreateFlow
        open={showCreate}
        initialType="post"
        onClose={() => setShowCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
