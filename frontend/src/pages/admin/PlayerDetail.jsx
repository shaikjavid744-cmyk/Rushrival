import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Gift, Gavel, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { adminApi, qs, newIdemKey } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Empty, Panel, StatusBadge, Json, fmtTime, fmtNum, fmtDelta, fmtBal, usePaged, ListState } from "@/components/admin/kit";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function T({ cols, rows, testid }) {
  if (!rows.length) return <Empty testid={`${testid}-empty`}>None.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table data-testid={testid}>
        <TableHeader><TableRow>{cols.map(([h]) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((r, i) => <TableRow key={i}>{cols.map(([h, f]) => <TableCell key={h} className="align-top">{f(r)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
  );
}

const LEDGER_COLS = [["When", (e) => fmtTime(e.created_at)], ["Reason", (e) => <code className="text-xs">{e.reason}</code>], ["Change", (e) => fmtDelta(e.delta)], ["Ref", (e) => <code className="text-xs">{e.ref || "—"}</code>], ["Balance after", (e) => fmtBal(e.balance)]];

function FullLedger({ userId }) {
  const paged = usePaged((c) => `/ledger${qs({ user_id: userId, limit: 25, cursor: c })}`, [userId]);
  return <ListState paged={paged} empty="No ledger entries."><T cols={LEDGER_COLS} rows={paged.items} testid="player-ledger-table" /></ListState>;
}

function Compensate({ userId, open, onOpenChange, onDone }) {
  const [f, setF] = useState({ coins: "", gems: "", hoverboards: "", reason: "" });
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setF({ coins: "", gems: "", hoverboards: "", reason: "" });
    setKey(newIdemKey()); // one key per dialog session → resubmits replay instead of double-granting
    setErr(null);
    setResult(null);
  }, [open]);
  const n = (v) => Math.max(0, parseInt(v || "0", 10) || 0);
  const valid = f.reason.trim().length >= 5 && n(f.coins) + n(f.gems) + n(f.hoverboards) > 0;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminApi.post(`/players/${userId}/compensate`, { coins: n(f.coins), gems: n(f.gems), hoverboards: n(f.hoverboards), reason: f.reason.trim() }, { idempotencyKey: key });
      setResult(r);
      toast.success(r.replayed ? "Already applied — this request was replayed, nothing granted twice." : "Compensation granted");
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 bg-card text-white" data-testid="compensate-dialog">
        <DialogHeader>
          <DialogTitle>Grant compensation</DialogTitle>
          <DialogDescription className="text-slate-300">Posts an idempotent <code>admin_compensation</code> ledger entry. Submitting the same request again won't grant twice.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          {["coins", "gems", "hoverboards"].map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`comp-${k}`} className="capitalize">{k}</Label>
              <Input id={`comp-${k}`} type="number" min="0" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={!!result} data-testid={`compensate-${k}-input`} />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="comp-reason">Reason (required, 5+ characters)</Label>
          <Textarea id="comp-reason" rows={3} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} disabled={!!result} data-testid="compensate-reason-input" />
        </div>
        {err && <p role="alert" className="text-sm text-red-300" data-testid="compensate-error">{err}</p>}
        {result && (
          <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="compensate-result">
            {result.replayed ? "Replayed — already applied once. " : "Applied. "}New wallet: {fmtBal(result.wallet)}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} data-testid="compensate-close-btn">{result ? "Done" : "Cancel"}</Button>
          <Button onClick={submit} disabled={!valid || busy} data-testid="compensate-submit-btn">{busy ? "Granting…" : result ? "Submit again (same request)" : "Grant"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlayerDetail() {
  const { id } = useParams();
  const { can } = useAdmin();
  const { data, error, loading, reload } = useAsync(() => adminApi.get(`/players/${id}`), [id]);
  const [comp, setComp] = useState(false);
  const [rev, setRev] = useState(0);
  const refreshAll = () => {
    reload();
    setRev((r) => r + 1);
  };
  const [enf, setEnf] = useState(null);
  const [days, setDays] = useState("7");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  const p = data.player;
  const enforce = async (reason) => {
    await adminApi.post(`/players/${id}/enforce`, { action: enf, reason, confirm: true, ...(enf === "suspend" ? { days: parseInt(days, 10) || 7 } : {}) });
    toast.success(enf === "unban" ? "Player unbanned" : `Player ${enf === "ban" ? "banned" : "suspended"} — scores hidden from leaderboards`);
    reload();
  };
  return (
    <div data-testid="admin-player-detail">
      <Link to="/admin/players" className="mb-3 inline-flex items-center gap-1 text-sm text-[#4da3ff] hover:underline" data-testid="player-back-link"><ArrowLeft className="h-4 w-4" aria-hidden /> Players</Link>
      <PageHeader
        title={p.name || p.email || p.user_id}
        testid="player-detail-name"
        description={`${p.email || "no email"} · ${p.user_id} · joined ${fmtTime(p.created_at)}`}
        actions={
          <>
            {can("economy:edit") && <Button onClick={() => setComp(true)} data-testid="player-compensate-btn"><Gift className="mr-1 h-4 w-4" aria-hidden /> Grant compensation</Button>}
            {can("players:enforce") && !p.banned && (
              <>
                <Button variant="secondary" onClick={() => setEnf("suspend")} data-testid="player-suspend-btn">Suspend</Button>
                <Button variant="destructive" onClick={() => setEnf("ban")} data-testid="player-ban-btn"><Gavel className="mr-1 h-4 w-4" aria-hidden /> Ban</Button>
              </>
            )}
            {can("players:enforce") && p.banned && <Button variant="secondary" onClick={() => setEnf("unban")} data-testid="player-unban-btn"><ShieldOff className="mr-1 h-4 w-4" aria-hidden /> Lift ban</Button>}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Status" testid="player-status-panel">
          <StatusBadge status={p.banned ? "banned" : "active"} testid="player-status-badge" />
          {p.banned && <p className="mt-2 text-sm text-muted-foreground">Reason: {p.ban_reason || "—"}{p.suspended_until ? ` · until ${fmtTime(p.suspended_until)}` : " · permanent"}</p>}
          <p className="mt-3 text-sm text-muted-foreground">Best score {fmtNum(p.stats?.best_score)} · {fmtNum(p.stats?.total_runs)} runs</p>
        </Panel>
        <Panel title="Wallet" testid="player-wallet-panel">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {["coins", "gems", "hoverboards", "xp"].map((k) => (
              <div key={k}><dt className="text-xs uppercase text-muted-foreground">{k}</dt><dd className="text-xl font-extrabold" data-testid={`player-wallet-${k}`}>{fmtNum(p.wallet?.[k])}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel title="Equipped & prefs"><Json value={{ equipped: p.equipped, prefs: p.prefs, ad_progress: p.ad_progress }} className="max-h-40" /></Panel>
      </div>
      <Tabs defaultValue="ledger" className="mt-6">
        <TabsList className="flex h-auto flex-wrap">
          {[["ledger", "Ledger"], ["inventory", "Inventory"], ["entitlements", `Entitlements (${data.entitlements.length})`], ["purchases", `Purchases (${data.purchases.length})`], ["runs", `Runs (${data.runs.length})`], ["reports", `Reports (${data.reports.length})`], ["tickets", `Tickets (${data.tickets.length})`]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} data-testid={`player-tab-${v}`}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="ledger" className="mt-4">{can("economy:view") ? <FullLedger key={rev} userId={id} /> : <T cols={LEDGER_COLS} rows={data.ledger} testid="player-ledger-table" />}</TabsContent>
        <TabsContent value="inventory" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3" data-testid="player-inventory">
            {Object.entries(p.inventory || {}).map(([k, v]) => <Panel key={k} title={k}><p className="text-sm">{(v || []).join(", ") || "—"}</p></Panel>)}
          </div>
        </TabsContent>
        <TabsContent value="entitlements" className="mt-4">{data.entitlements.length ? <ul className="flex flex-wrap gap-2" data-testid="player-entitlements">{data.entitlements.map((e) => <li key={e}><StatusBadge status={e} /></li>)}</ul> : <Empty>No active entitlements.</Empty>}</TabsContent>
        <TabsContent value="purchases" className="mt-4"><T testid="player-purchases-table" rows={data.purchases} cols={[["When", (r) => fmtTime(r.created_at)], ["Product", (r) => r.product_id], ["Order", (r) => <code className="text-xs">{r.order_id}</code>], ["Token", (r) => <code className="text-xs" data-testid="masked-token">{r.purchase_token}</code>], ["State", (r) => <StatusBadge status={r.revoked ? "revoked" : r.verify_state || "verified"} />]]} /></TabsContent>
        <TabsContent value="runs" className="mt-4"><T testid="player-runs-table" rows={data.runs} cols={[["When", (r) => fmtTime(r.created_at)], ["Mode", (r) => r.mode], ["World", (r) => r.world || r.report?.world], ["Status", (r) => <StatusBadge status={r.status} />], ["Score", (r) => fmtNum(r.report?.score)], ["Distance", (r) => (r.report ? `${Math.round(r.report.distance)} m` : "—")], ["Coins", (r) => fmtNum(r.report?.coins)]]} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><T testid="player-reports-table" rows={data.reports} cols={[["When", (r) => fmtTime(r.created_at)], ["Reason", (r) => r.reason], ["Details", (r) => r.details || r.note || "—"], ["Status", (r) => <StatusBadge status={r.status || "open"} />]]} /></TabsContent>
        <TabsContent value="tickets" className="mt-4"><T testid="player-tickets-table" rows={data.tickets} cols={[["Ticket", (t) => (can("tickets:view") ? <Link className="text-[#4da3ff] hover:underline" to={`/admin/tickets/${t.ticket_no}`}>{t.ticket_no}</Link> : t.ticket_no)], ["Category", (t) => t.category], ["Message", (t) => <span className="line-clamp-2">{t.message}</span>], ["Status", (t) => <StatusBadge status={t.status} />]]} /></TabsContent>
      </Tabs>
      <Compensate userId={id} open={comp} onOpenChange={setComp} onDone={refreshAll} />
      <ConfirmDialog
        open={!!enf}
        onOpenChange={(o) => !o && setEnf(null)}
        testid="enforce-dialog"
        title={enf === "ban" ? "Ban this player?" : enf === "suspend" ? "Suspend this player?" : "Lift the ban?"}
        description={enf === "unban" ? "The player can sign in again and their scores return to leaderboards." : "Their sign-ins are blocked, sessions revoked and scores hidden from leaderboards."}
        confirmLabel={enf === "ban" ? "Ban player" : enf === "suspend" ? "Suspend player" : "Lift ban"}
        destructive={enf !== "unban"}
        reason
        typed={enf === "unban" ? undefined : enf?.toUpperCase()}
        onConfirm={enforce}
      >
        {enf === "suspend" && (
          <div className="space-y-1">
            <Label htmlFor="suspend-days">Days (1–365)</Label>
            <Input id="suspend-days" type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} data-testid="enforce-days-input" />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
