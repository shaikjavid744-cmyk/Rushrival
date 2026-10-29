import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Inbox, Loader2, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/api";

export const fmtTime = (d) => {
  if (!d) return "—";
  const s = typeof d === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? `${d}Z` : d;
  const t = new Date(s);
  return isNaN(t) ? String(d) : t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
export const fmtNum = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString());
export const fmtDelta = (d) =>
  Object.entries(d || {})
    .map(([k, v]) => `${v > 0 ? "+" : ""}${fmtNum(v)} ${k}`)
    .join(", ") || "—";
export const fmtBal = (d) =>
  Object.entries(d || {})
    .map(([k, v]) => `${fmtNum(v)} ${k}`)
    .join(", ") || "—";

export function PageHeader({ title, description, actions, testid }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl" data-testid={testid || "admin-page-title"}>{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…", testid = "admin-loading" }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground" role="status" data-testid={testid}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry, testid = "admin-error" }) {
  const forbidden = error?.status === 403;
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-5 text-sm" data-testid={testid}>
      <p className="flex items-center gap-2 font-bold text-red-200">
        {forbidden ? <Lock className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
        {forbidden ? "You don't have permission to view this." : error?.message || "Something went wrong."}
      </p>
      {forbidden && <p className="text-muted-foreground">Ask an Owner to change your role if you need access.</p>}
      {onRetry && !forbidden && (
        <Button size="sm" variant="secondary" onClick={onRetry} data-testid={`${testid}-retry-btn`}>
          <RotateCw className="mr-1 h-4 w-4" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children = "Nothing here yet.", testid = "admin-empty" }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground" data-testid={testid}>
      <Inbox className="h-4 w-4" aria-hidden /> {children}
    </div>
  );
}

export function Forbidden({ perm }) {
  return <ErrorBlock error={{ status: 403, message: `Missing permission ${perm}` }} testid="admin-forbidden" />;
}

const STATUS_CLS = {
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  approved: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  pending_approval: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  draft: "bg-slate-500/20 text-slate-200 border-slate-400/40",
  superseded: "bg-slate-700/40 text-slate-400 border-slate-600/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
  open: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  reviewing: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  actioned: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  dismissed: "bg-slate-600/30 text-slate-300 border-slate-500/40",
  replied: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  closed: "bg-slate-600/30 text-slate-300 border-slate-500/40",
  banned: "bg-red-500/15 text-red-300 border-red-500/40",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

export function StatusBadge({ status, testid }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-bold ${STATUS_CLS[status] || "text-slate-200"}`} data-testid={testid}>
      {String(status || "—").replace(/_/g, " ")}
    </Badge>
  );
}

export function Panel({ title, children, actions, className = "", testid }) {
  return (
    <section className={`rounded-2xl border bg-card p-5 ${className}`} data-testid={testid}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-extrabold text-white">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Json({ value, className = "" }) {
  return (
    <pre className={`max-h-80 overflow-auto rounded-lg bg-[#070D20] p-3 text-xs text-slate-200 ${className}`}>{value === undefined ? "—" : JSON.stringify(value, null, 2)}</pre>
  );
}

/** Cursor-paginated admin list. `path(cursor)` builds the URL. */
export function usePaged(path, deps = []) {
  const [st, setSt] = useState({ items: [], next: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(
    async (cursor, append) => {
      const id = ++seq.current;
      setSt((s) => ({ ...s, loading: true, error: null }));
      try {
        const d = await adminApi.get(path(cursor));
        if (id !== seq.current) return;
        setSt((s) => ({ items: append ? [...s.items, ...d.items] : d.items, next: d.next_cursor || null, loading: false, error: null }));
      } catch (error) {
        if (id === seq.current) setSt((s) => ({ ...s, loading: false, error }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
  useEffect(() => {
    load(null, false);
  }, [load]);
  return { ...st, reload: () => load(null, false), loadMore: () => load(st.next, true) };
}

export function LoadMore({ paged, testid = "load-more-btn" }) {
  if (!paged.next) return null;
  return (
    <Button variant="secondary" className="mt-4" onClick={paged.loadMore} disabled={paged.loading} data-testid={testid}>
      {paged.loading ? "Loading…" : "Load more"}
    </Button>
  );
}

export function ListState({ paged, empty, children }) {
  if (paged.error && !paged.items.length) return <ErrorBlock error={paged.error} onRetry={paged.reload} />;
  if (paged.loading && !paged.items.length) return <Loading />;
  if (!paged.items.length) return <Empty>{empty}</Empty>;
  return (
    <>
      {children}
      {paged.error && <p className="mt-2 text-sm text-red-300">{paged.error.message}</p>}
      <LoadMore paged={paged} />
    </>
  );
}
