import { toast } from "sonner";
import { Power } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Panel } from "@/components/admin/kit";
import { ConfirmDialog, useConfirm } from "@/components/admin/ConfirmDialog";
import { Switch } from "@/components/ui/switch";

const FLAG_INFO = { events: "Events screen and event progress", leaderboard: "Global leaderboards", shop: "In-game shop" };

export default function Flags() {
  const { can } = useAdmin();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/config/published"), []);
  const c = useConfirm();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  const r = data.data.remote;
  const canPub = can("config:publish");
  const quick = (body, msg) => async () => {
    const d = await adminApi.post("/config/quick", { ...body, confirm: true });
    toast.success(`${msg} — published as v${d.version}`);
    reload();
  };
  const toggleMaint = (on) =>
    c.ask({
      title: on ? "Turn maintenance ON?" : "Turn maintenance off?",
      description: on ? "Every player sees the Maintenance screen on the next config fetch and can't play online until you turn it off." : "Players can play again on the next config fetch.",
      confirmLabel: on ? "Turn maintenance on" : "Turn maintenance off",
      destructive: on,
      typed: on ? "MAINTENANCE" : undefined,
      testid: "maintenance-dialog",
      onConfirm: quick({ maintenance: on }, on ? "Maintenance ON" : "Maintenance off"),
    });
  const toggleFlag = (k, on) =>
    c.ask({
      title: `${on ? "Enable" : "Disable"} “${k}”?`,
      description: `${FLAG_INFO[k] || k} will be ${on ? "available" : "hidden"} in the app on the next config fetch.`,
      confirmLabel: on ? "Enable" : "Disable",
      destructive: !on,
      testid: `flag-dialog-${k}`,
      onConfirm: quick({ flags: { [k]: on } }, `${k} ${on ? "enabled" : "disabled"}`),
    });
  return (
    <div data-testid="admin-flags">
      <PageHeader title="Maintenance & feature flags" description={`Live config v${data.version}. Each toggle publishes a new immutable version (audited) and can be rolled back from Remote config.`} />
      {!canPub && <p className="mb-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="flags-readonly-note">View only — toggling needs config:publish.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Maintenance mode" testid="maintenance-panel" className={r.maintenance ? "border-red-500/60" : ""}>
          <div className="flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm"><Power className={`h-5 w-5 ${r.maintenance ? "text-red-400" : "text-emerald-400"}`} aria-hidden /> <span data-testid="maintenance-state">{r.maintenance ? "ON — players see the Maintenance screen" : "Off — game is running normally"}</span></p>
            <Switch checked={!!r.maintenance} disabled={!canPub} onCheckedChange={toggleMaint} aria-label="Maintenance mode" data-testid="maintenance-switch" />
          </div>
        </Panel>
        <Panel title="Feature flags" testid="flags-panel">
          <ul className="divide-y">
            {Object.entries(r.flags || {}).map(([k, on]) => (
              <li key={k} className="flex items-center justify-between gap-4 py-3">
                <div><p className="font-bold capitalize">{k}</p><p className="text-xs text-muted-foreground">{FLAG_INFO[k] || "Feature flag"}</p></div>
                <Switch checked={!!on} disabled={!canPub} onCheckedChange={(v) => toggleFlag(k, v)} aria-label={`${k} flag`} data-testid={`flag-switch-${k}`} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <ConfirmDialog {...c.props} />
    </div>
  );
}
