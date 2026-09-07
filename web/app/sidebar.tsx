"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type Item = { href: string; label: string };
type Group = { label: string; icon: ReactNode; children: Item[] };
type Single = { href: string; label: string; icon: ReactNode };
type Entry = Single | Group;

// Inline SVG icons — 18px, stroke currentColor
function I({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const ConnectionsIcon = (
  <I>
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </I>
);
const PostsIcon = (
  <I>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </I>
);
const AnalyticsIcon = (
  <I>
    <line x1="4" y1="20" x2="4" y2="10" />
    <line x1="10" y1="20" x2="10" y2="4" />
    <line x1="16" y1="20" x2="16" y2="14" />
    <line x1="21" y1="20" x2="3" y2="20" />
  </I>
);
const CommentToDmIcon = (
  <I>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <polyline points="13 8 10 11 13 14" />
  </I>
);
const CommentIcon = (
  <I>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </I>
);
const ResearchIcon = (
  <I>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </I>
);
const DownloadIcon = (
  <I>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </I>
);
const EditIcon = (
  <I>
    <path d="m16 3 5 5-11 11H5v-5L16 3z" />
    <path d="M14 5.5 18.5 10" />
  </I>
);
const SettingsIcon = (
  <I>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="18" r="2" fill="currentColor" stroke="none" />
  </I>
);

const NAV: Entry[] = [
  { href: "/accounts", label: "Connections", icon: ConnectionsIcon },
  {
    label: "Posts",
    icon: PostsIcon,
    children: [
      { href: "/", label: "Tổng hợp" },
      { href: "/content/post", label: "Post" },
      { href: "/content/shorts", label: "Shorts" },
      { href: "/content/long", label: "Long" },
    ],
  },
  { href: "/research", label: "Research", icon: ResearchIcon },
  { href: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { href: "/comments", label: "Comment", icon: CommentIcon },
  { href: "/comment-to-dm", label: "Comment to DM", icon: CommentToDmIcon },
  { href: "/download", label: "Tải video", icon: DownloadIcon },
  { href: "/edit/daily-news", label: "Edit daily news", icon: EditIcon },
  { href: "/edit/youtube", label: "YouTube repurpose", icon: EditIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(href: string, path: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function SingleLink({ href, label, icon }: Single) {
  const path = usePathname();
  const active = isActive(href, path);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        active
          ? "bg-canvas font-semibold text-ink"
          : "font-medium text-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      <span className={active ? "text-ink" : "text-muted"}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function SubLink({ href, label }: Item) {
  const path = usePathname();
  const active = isActive(href, path);
  return (
    <Link
      href={href}
      className={`block px-3 py-1.5 rounded-lg text-sm transition ${
        active
          ? "bg-canvas font-semibold text-ink"
          : "font-medium text-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function NavGroup({ group }: { group: Group }) {
  const path = usePathname();
  const hasActiveChild = group.children.some((c) => isActive(c.href, path));
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
          hasActiveChild
            ? "font-semibold text-ink"
            : "font-medium text-muted hover:bg-canvas hover:text-ink"
        }`}
      >
        <span className={hasActiveChild ? "text-ink" : "text-muted"}>{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-muted text-xs transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ▸
        </span>
      </button>
      {open && (
        <div className="mt-0.5 ml-[1.85rem] flex flex-col gap-0.5">
          {group.children.map((c) => (
            <SubLink key={c.href} {...c} />
          ))}
        </div>
      )}
    </div>
  );
}

function toggleDark() {
  document.documentElement.classList.toggle("dark");
}

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-surface min-h-screen flex flex-col">
      {/* Top: profile */}
      <div className="px-3 pt-4 pb-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas transition"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#17130D] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/contentta-mark-white.svg" alt="Contentta" className="w-6 h-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink truncate">Contentta</span>
            <span className="block text-xs text-muted truncate">thanhthuduc99@gmai…</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((entry) =>
          "children" in entry ? (
            <NavGroup key={entry.label} group={entry} />
          ) : (
            <SingleLink key={entry.href} {...entry} />
          ),
        )}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 flex items-center gap-2">
        <a
          href="https://docs.zernio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 rounded-full bg-ink text-white text-xs font-semibold px-3 py-2 hover:opacity-90 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Documentation
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
        <button
          type="button"
          onClick={toggleDark}
          aria-label="Đổi giao diện sáng/tối"
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted hover:bg-canvas hover:text-ink transition shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
