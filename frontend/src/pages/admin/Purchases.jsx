import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, qs } from "@/lib/api";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, usePaged, ListState, StatusBadge, fmtTime, fmtDelta } from "@/components/admin/kit";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FilterSelect } from "@/pages/admin/Reports";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const grantText = (g) => [fmtDelta(Object.fromEntries(Object.entries(g || {}).filter(([, v]) => typeof v === "number"))), ...(g?.entitlements || [])].filter((x) => x && x !== "—").join(" · ");

export default function Purchases() {
  const { can } = useAdmin();
  const [revoked, setRevoked] = useState("");
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(null);
  const paged = usePaged((c) => `/purchases${qs({ revoked, limit: 50, cursor: c })}`, [revoked]);
  const reverify = async (p) => {
    setBusy(p.purchase_id);
    try {
      const r = await adminApi.post(`/purchases/${p.purchase_id}/reverify`);
      toast.success(`Verification state: ${r.verify_state}`);
      paged.reload();
    } catch (e) {
      toast.error(e.code === "verification_unavailable" ? "Google Play verification isn't configured yet (service account missing). Nothing changed." : e.message);
    } finally {
      setBusy(null);
    }
  };
  const revoke = async (reason) => {
    await adminApi.post(`/purchases/${target.purchase_id}/revoke`, { reason, confirm: true });
    toast.success("Entitlement revoked");
    paged.reload();
  };
  return (
    <div data-testid="admin-purchases">
      <PageHeader title="Purchases" description="Verified Google Play purchases. Purchase tokens are masked. Mock purchases come from the preview's TEST MODE billing." />
      <div className="mb-4 w-48"><FilterSelect id="purchase-revoked" label="State" value={revoked} onChange={setRevoked} options={[["", "All"], ["false", "Active"], ["true", "Revoked / refunded"]]} testid="purchases-state-filter" /></div>
      <ListState paged={paged} empty="No purchases.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="purchases-table">
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Product</TableHead><TableHead>Player</TableHead><TableHead>Order / token</TableHead><TableHead>Grant</TableHead><TableHead>State</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((p) => (
                <TableRow key={p.purchase_id} data-testid={`purchase-row-${p.purchase_id}`}>
                  <TableCell className="whitespace-nowrap">{fmtTime(p.created_at)}</TableCell>
                  <TableCell>{p.product_id}{p.mock && <span className="ml-1 rounded bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300">MOCK</span>}</TableCell>
                  <TableCell><Link className="font-mono text-xs text-[#4da3ff] hover:underline" to={`/admin/players/${p.owner}`}>{p.owner}</Link></TableCell>
                  <TableCell><code className="block text-xs">{p.order_id}</code><code className="text-xs text-muted-foreground" data-testid={`purchase-token-${p.purchase_id}`}>{p.purchase_token}</code></TableCell>
                  <TableCell className="text-xs">{grantText(p.grant)}</TableCell>
                  <TableCell><StatusBadge status={p.revoked ? "revoked" : p.verify_state || "verified"} testid={`purchase-state-${p.purchase_id}`} />{p.revoke_reason && <div className="mt-1 text-xs text-muted-foreground">{p.revoke_reason}</div>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {can("purchases:refund") && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={busy === p.purchase_id} onClick={() => reverify(p)} data-testid={`purchase-reverify-btn-${p.purchase_id}`}>{busy === p.purchase_id ? "Checking…" : "Re-verify"}</Button>
                        {!p.revoked && <Button size="sm" variant="destructive" onClick={() => setTarget(p)} data-testid={`purchase-revoke-btn-${p.purchase_id}`}>Revoke</Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} testid="revoke-dialog" title="Revoke this purchase?" description={`Deactivates entitlements from ${target?.product_id} and claws back unspent currency. A ledger entry and audit entry are written.`} confirmLabel="Revoke entitlement" reason typed="REVOKE" onConfirm={revoke} />
    </div>
  );
}
