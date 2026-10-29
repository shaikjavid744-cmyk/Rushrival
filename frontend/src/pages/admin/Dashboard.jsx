import { Link } from "react-router-dom";
import { Users, Activity, Timer, ShoppingCart, Gift, LifeBuoy, Flag, PlugZap, Bug } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader, Loading, ErrorBlock, fmtNum, fmtTime } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

function Tile({ icon: Icon, label, value, sub, testid, to }) {
  const body = (
    <div className="h-full rounded-2xl border bg-card p-5 transition-colors hover:border-[#1F8BFF]" data-testid={testid}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4 text-[#4da3ff]" aria-hidden /> {label}</p>
      <p className="mt-2 text-3xl font-extrabold text-white" data-testid={`${testid}-value`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="block rounded-2xl">{body}</Link> : body;
}

function NotConnected({ icon: Icon, title, label, testid }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/5 p-5" data-testid={testid}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-300"><Icon className="h-4 w-4" aria-hidden /> {title}</p>
      <p className="mt-2 text-lg font-extrabold text-white">Connection required</p>
      <p className="mt-1 text-sm text-muted-foreground" data-testid={`${testid}-label`}>{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: d, error, loading, reload } = useAsync(() => adminApi.get("/dashboard"), []);
  return (
    <div data-testid="admin-dashboard">
      <PageHeader title="Dashboard" description="Live numbers computed from the game database. Nothing here is estimated." actions={<Button variant="secondary" size="sm" onClick={reload} data-testid="dashboard-refresh-btn">Refresh</Button>} />
      {loading && !d && <Loading />}
      {error && <ErrorBlock error={error} onRetry={reload} />}
      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={Users} label="Players" value={fmtNum(d.players.total)} sub={`${fmtNum(d.players.new_7d)} new in the last 7 days`} testid="dash-players" to="/admin/players" />
            <Tile icon={Activity} label="DAU / WAU" value={`${fmtNum(d.players.dau)} / ${fmtNum(d.players.wau)}`} sub="Distinct players with runs today / 7 days" testid="dash-active" />
            <Tile icon={Activity} label="Runs today" value={fmtNum(d.runs.today)} sub="Finished, server-validated runs" testid="dash-runs" />
            <Tile icon={Timer} label="Avg run length" value={d.runs.avg_duration_s_7d ? `${d.runs.avg_duration_s_7d}s` : "—"} sub="Finished runs, last 7 days" testid="dash-avg-run" />
            <Tile icon={ShoppingCart} label="Purchases" value={fmtNum(d.purchases.verified)} sub={`${fmtNum(d.purchases.refunded)} refunded / revoked`} testid="dash-purchases" to="/admin/purchases" />
            <Tile icon={ShoppingCart} label="Verified revenue" value={d.purchases.revenue_by_currency ? Object.entries(d.purchases.revenue_by_currency).map(([c, v]) => `${v} ${c}`).join(" · ") : "Not available"} sub={d.purchases.revenue_note} testid="dash-revenue" />
            <Tile icon={Gift} label="Ad rewards granted" value={fmtNum(d.ads.rewards_granted)} sub="In-app rewarded ad grants" testid="dash-ad-rewards" />
            <Tile icon={LifeBuoy} label="Open tickets" value={fmtNum(d.support.open_tickets)} testid="dash-tickets" to="/admin/tickets" />
            <Tile icon={Flag} label="Open reports" value={fmtNum(d.support.open_reports)} testid="dash-reports" to="/admin/reports" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <NotConnected icon={Bug} title="Crashes · Firebase" label={d.crashes.label} testid="dash-firebase" />
            <NotConnected icon={PlugZap} title="Ad revenue · AdMob" label={d.ads.admob.label} testid="dash-admob" />
          </div>
          <p className="text-xs text-muted-foreground" data-testid="dash-generated-at">Generated {fmtTime(d.generated_at)}</p>
        </div>
      )}
    </div>
  );
}
