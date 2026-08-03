"use client";
import { useState } from "react";
import PostsBrowser from "@/components/posts-browser";
import CreateFlow from "@/components/create/create-flow";

export default function LongTypePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div>
      <PostsBrowser
        fixedType="youtube"
        title="Long"
        subtitle="Video YouTube dài — script + ngày nhắc đăng (không đăng qua app)"
        hidePlatformFilter
        reloadKey={reloadKey}
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Tạo video dài
          </button>
        }
      />
      <CreateFlow
        open={showCreate}
        initialType="youtube"
        onClose={() => setShowCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
