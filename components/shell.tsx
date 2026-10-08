"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BriefcaseBusiness, Database, LayoutDashboard, LogOut, ScanLine, Search, Settings, Shield } from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  if (path === "/login") return children;

  const nav = [
    ["Overview", "/", LayoutDashboard],
    ["Cases", "/cases", BriefcaseBusiness],
    ["Tool directory", "/tools", Database],
    ["Image forensics", "/forensics", ScanLine],
    ["Settings", "/settings", Settings],
  ] as const;

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-800/80 bg-[#0a0e16]/90 p-4 backdrop-blur-xl md:flex md:flex-col">
        <div className="mb-9 flex items-center gap-3 px-2">
          <Shield className="text-emerald-300" size={22} />
          <div><b className="text-sm tracking-widest">FIELDNOTES</b><p className="text-[10px] tracking-wider muted">PRIVATE INTELLIGENCE</p></div>
        </div>
        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</div>
        <nav className="space-y-1">
          {nav.map(([name, href, Icon]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={`motion-nav flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${path === href ? "bg-slate-800/80 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>
              <Icon size={17} />{name}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-800 pt-4">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
            <LogOut size={17} />Sign out
          </button>
          <div className="px-3 pt-3 text-xs text-slate-600">Single-user private instance</div>
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-[#080b12]/35 px-5 backdrop-blur-xl md:px-8">
          <div className="text-sm muted">Workspace <span className="px-2 text-slate-600">/</span><span className="text-slate-300">{path === "/" ? "Overview" : path.split("/").filter(Boolean).join(" / ") || "Overview"}</span></div>
          <Link href="/tools" className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-emerald-300/30 hover:text-white">
            <Search size={14} />Search catalog <kbd className="rounded bg-slate-800 px-1.5">/</kbd>
          </Link>
        </header>
        <div key={path} className="motion-page mx-auto max-w-7xl p-5 md:p-8">{children}</div>
      </section>
    </div>
  );
}
