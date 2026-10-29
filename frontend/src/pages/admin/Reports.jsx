import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, qs } from "@/lib/api";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, usePaged, ListState, StatusBadge, fmtTime } from "@/components/admin/kit";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUSES = ["open", "reviewing", "actioned", "dismissed"];

export function FilterSelect({ id, label, value, onChange, options, testid }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" data-testid={testid}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function Reports() {
  const { can } = useAdmin();
  const [status, setStatus] = useState("open");
  const [edit, setEdit] = useState(null);
  const [next, setNext] = useState("reviewing");
  const paged = usePaged((c) => `/reports${qs({ status, limit: 20, cursor: c })}`, [status]);
  const save = async (note) => {
    await adminApi.patch(`/reports/${edit.report_id}`, { status: next, note });
    toast.success(`Report marked ${next}`);
    paged.reload();
  };
  return (
    <div data-testid="admin-reports">
      <PageHeader title="Reports queue" description="Player reports move open → reviewing → actioned or dismissed. To ban, open the reported player." />
      <div className="mb-4 w-48"><FilterSelect id="report-status" label="Status" value={status} onChange={setStatus} options={[["", "All"], ...STATUSES.map((s) => [s, s])]} testid="reports-status-filter" /></div>
      <ListState paged={paged} empty="No reports with this status.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="reports-table">
            <TableHeader><TableRow><TableHead>Reported</TableHead><TableHead>Reason</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((r) => (
                <TableRow key={r.report_id} data-testid={`report-row-${r.report_id}`}>
                  <TableCell className="align-top">
                    {can("players:view") ? <Link className="font-mono text-xs text-[#4da3ff] hover:underline" to={`/admin/players/${r.target_user_id}`} data-testid={`report-player-link-${r.report_id}`}>{r.target_user_id}</Link> : <span className="font-mono text-xs">{r.target_user_id}</span>}
                    <div className="text-xs text-muted-foreground">{fmtTime(r.created_at)}</div>
                  </TableCell>
                  <TableCell className="align-top">{r.reason}</TableCell>
                  <TableCell className="max-w-xs align-top">{r.details || r.note || "—"}</TableCell>
                  <TableCell className="align-top"><StatusBadge status={r.status || "open"} testid={`report-status-${r.report_id}`} /></TableCell>
                  <TableCell className="max-w-xs align-top text-xs text-muted-foreground">{(r.notes || []).map((n, i) => <div key={i}>{n.status}: {n.note || "—"}</div>)}</TableCell>
                  <TableCell className="align-top">{can("reports:edit") && <Button size="sm" variant="secondary" onClick={() => { setEdit(r); setNext(r.status === "open" || !r.status ? "reviewing" : "actioned"); }} data-testid={`report-update-btn-${r.report_id}`}>Update</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
      <ConfirmDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} testid="report-dialog" title="Update report" destructive={false} confirmLabel="Save" reason reasonLabel="Note" onConfirm={save}>
        <FilterSelect id="report-next" label="New status" value={next} onChange={setNext} options={STATUSES.map((s) => [s, s])} testid="report-next-status-select" />
      </ConfirmDialog>
    </div>
  );
}
