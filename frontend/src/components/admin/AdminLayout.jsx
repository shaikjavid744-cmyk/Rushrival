import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Flag, Receipt, Package, CalendarRange, Newspaper, SlidersHorizontal, Power, ShoppingCart, LifeBuoy, Rocket, ScrollText, ShieldCheck, UserCircle, LogOut, Menu, X, Loader2,
} from "lucide-react";
import { Toaster } from "sonner";
import { useAdmin } from "@/lib/adminAuth";
import { useSeo } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { artUrl } from "@/lib/api";

export const SECTIONS = [
  ["/admin", "Dashboard", LayoutDashboard, "dashboard:view"],
  ["/admin/players", "Players", Users, "players:view"],
  ["/admin/reports", "Reports", Flag, "reports:view"],
  ["/admin/transactions", "Transactions", Receipt, "economy:view"],
  ["/admin/catalogue", "Catalogue", Package, "catalog:view"],
  ["/admin/liveops", "Live-ops", CalendarRange, "liveops:view"],
  ["/admin/content", "News & FAQ", Newspaper, "content:view"],
  ["/admin/config", "Remote config", SlidersHorizontal, "config:view"],
  ["/admin/flags", "Maintenance & flags", Power, "config:view"],
  ["/admin/purchases", "Purchases", ShoppingCart, "purchases:view"],
  ["/admin/tickets", "Support tickets", LifeBuoy, "tickets:view"],
  ["/admin/releases", "Releases", Rocket, "release:view"],
  ["/admin/audit", "Audit log", ScrollText, "audit:view"],
  ["/admin/admins", "Admins", ShieldCheck, "admins:manage_admins"],
  ["/admin/profile", "My profile", UserCircle, null],
];

function Sidebar({ onNavigate }) {
  const { can } = useAdmin();
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5" data-testid="admin-sidebar">
      {SECTIONS.filter(([, , , p]) => !p || can(p)).map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/admin"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? "bg-[#1F8BFF] text-white shadow-[0_3px_0_#0D52C2]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`
          }
          data-testid={`admin-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const { status, admin, signOut, reason, refresh } = useAdmin();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useSeo({ title: "Admin", description: "Rush Rivals operations panel", noindex: true });
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  if (status === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground" data-testid="admin-boot-loading">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> Checking your session…
      </div>
    );
  if (status === "error")
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-white" role="alert" data-testid="admin-boot-error">
        <p>Can't reach the admin API: {reason}</p>
        <Button onClick={refresh} data-testid="admin-boot-retry-btn">Retry</Button>
      </div>
    );
  if (status !== "authed") return <Navigate to="/admin/login" replace state={{ from: loc.pathname, reason }} />;

  return (
    <div className="min-h-screen bg-background font-sans text-white" data-testid="admin-layout">
      <Toaster theme="dark" richColors position="top-right" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-[#070D20] p-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto"><Sidebar /></div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close navigation" onClick={() => setOpen(false)} data-testid="admin-nav-scrim" />
          <div className="relative h-full w-72 overflow-y-auto bg-[#070D20] p-4">
            <Brand />
            <div className="mt-6"><Sidebar onNavigate={() => setOpen(false)} /></div>
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <button type="button" className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} data-testid="admin-nav-toggle">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-right sm:block" data-testid="admin-current-user">
              <span className="block font-bold">{admin.name || admin.email}</span>
              <span className="block text-xs text-muted-foreground">{admin.role_name}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={signOut} data-testid="admin-signout-btn"><LogOut className="mr-1 h-4 w-4" aria-hidden /> Sign out</Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" id="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src={artUrl("/api/static/game/logo.png")} alt="Rush Rivals" className="h-9 w-auto" />
      <span className="rounded bg-[#FFC107] px-1.5 py-0.5 text-[11px] font-extrabold uppercase text-[#3A1C00]">Admin</span>
    </div>
  );
}

export function RequirePerm({ perm, children }) {
  const { can } = useAdmin();
  if (!can(perm))
    return (
      <div role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 p-6" data-testid="admin-forbidden">
        <p className="font-bold">You don't have access to this section.</p>
        <p className="mt-1 text-sm text-muted-foreground">It needs the {perm} permission. Ask an Owner if you need it.</p>
      </div>
    );
  return children;
}
