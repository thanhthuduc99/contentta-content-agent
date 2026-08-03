"use client";
import { useState } from "react";
import PostsBrowser from "@/components/posts-browser";
import CreateFlow from "@/components/create/create-flow";
import ImportCsvPanel from "@/components/import-csv-panel";

export default function PostsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div>
      <PostsBrowser
        title="Tổng hợp"
        subtitle="Toàn bộ nội dung — mọi loại, mọi trạng thái"
        reloadKey={reloadKey}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Tạo bài
            </button>
            <button className="btn btn-ghost" onClick={() => setShowCsv(true)}>
              ⬆ Import CSV
            </button>
          </>
        }
      />
      <CreateFlow
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
      <ImportCsvPanel open={showCsv} onClose={() => setShowCsv(false)} onDone={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
