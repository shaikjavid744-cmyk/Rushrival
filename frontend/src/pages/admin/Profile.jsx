import { toast } from "sonner";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Panel, fmtTime } from "@/components/admin/kit";
import { ConfirmDialog, useConfirm } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";

export default function Profile() {
  const { admin, expire } = useAdmin();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/sessions"), []);
  const c = useConfirm();
  return (
    <div data-testid="admin-profile">
      <PageHeader title="My profile" description={`${admin.email} · ${admin.role_name}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel
          title="Active sessions"
          actions={<Button variant="destructive" size="sm" onClick={() => c.ask({ title: "Sign out everywhere?", description: "Every session for your account is revoked, including this one.", confirmLabel: "Sign out everywhere", testid: "signout-all-dialog", onConfirm: async () => { await adminApi.post("/sessions/revoke-all"); expire("You signed out everywhere."); } })} data-testid="signout-everywhere-btn"><LogOut className="mr-1 h-4 w-4" aria-hidden /> Sign out everywhere</Button>}
        >
          {loading && !data && <Loading />}
          {error && <ErrorBlock error={error} onRetry={reload} />}
          {data && (
            <ul className="divide-y" data-testid="sessions-list">
              {data.items.map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`session-${s.session_id}`}>
                  <div className="flex items-start gap-3">
                    <MonitorSmartphone className="mt-0.5 h-5 w-5 text-[#4da3ff]" aria-hidden />
                    <div className="text-sm">
                      <p className="font-bold">{s.ip} {s.current && <span className="ml-1 rounded bg-emerald-500/20 px-1.5 text-xs text-emerald-300">This session</span>}</p>
                      <p className="max-w-md truncate text-xs text-muted-foreground">{s.user_agent}</p>
                      <p className="text-xs text-muted-foreground">Started {fmtTime(s.created_at)} · last active {fmtTime(s.last_seen)}</p>
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="secondary" onClick={() => c.ask({ title: "Revoke this session?", description: "That browser is signed out on its next request.", confirmLabel: "Revoke", testid: "revoke-session-dialog", onConfirm: async () => { await adminApi.post(`/sessions/${s.session_id}/revoke`); toast.success("Session revoked"); reload(); } })} data-testid={`revoke-session-btn-${s.session_id}`}>Revoke</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Your permissions">
          <ul className="flex flex-wrap gap-1" data-testid="my-permissions">
            {admin.permissions.map((p) => <li key={p} className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-300">{p}</li>)}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">Sessions end after 30 minutes idle or 12 hours total.</p>
        </Panel>
      </div>
      <ConfirmDialog {...c.props} />
    </div>
  );
}
