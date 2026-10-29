import { useState } from "react";
import { Link } from "react-router-dom";
import { qs } from "@/lib/api";
import { PageHeader, usePaged, ListState, fmtTime, fmtDelta, fmtBal } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { user_id: "", reason: "", date_from: "", date_to: "" };

export default function Ledger() {
  const [form, setForm] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const paged = usePaged((c) => `/ledger${qs({ ...f, date_from: f.date_from && `${f.date_from}T00:00:00`, date_to: f.date_to && `${f.date_to}T23:59:59`, limit: 50, cursor: c })}`, [f]);
  const fields = [["user_id", "Player id", "usr_…"], ["reason", "Type / reason", "e.g. run, iap, admin_compensation"], ["date_from", "From", ""], ["date_to", "To", ""]];
  return (
    <div data-testid="admin-ledger">
      <PageHeader title="Transactions" description="Every coin, gem and hoverboard movement (append-only ledger)." />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); setF(form); }} data-testid="ledger-filters">
        {fields.map(([k, l, ph]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`ledger-${k}`} className="text-xs text-muted-foreground">{l}</Label>
            <Input id={`ledger-${k}`} type={k.startsWith("date") ? "date" : "text"} placeholder={ph} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`ledger-filter-${k}`} />
          </div>
        ))}
        <div className="flex items-end gap-2">
          <Button type="submit" data-testid="ledger-apply-btn">Apply</Button>
          <Button type="button" variant="ghost" onClick={() => { setForm(EMPTY); setF(EMPTY); }} data-testid="ledger-reset-btn">Reset</Button>
        </div>
      </form>
      <ListState paged={paged} empty="No transactions match these filters.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="ledger-table">
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Player</TableHead><TableHead>Reason</TableHead><TableHead>Change</TableHead><TableHead>Ref</TableHead><TableHead>Balance after</TableHead></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((e) => (
                <TableRow key={e.entry_id} data-testid={`ledger-row-${e.entry_id}`}>
                  <TableCell className="whitespace-nowrap">{fmtTime(e.created_at)}</TableCell>
                  <TableCell><Link className="font-mono text-xs text-[#4da3ff] hover:underline" to={`/admin/players/${e.user_id}`}>{e.user_id}</Link></TableCell>
                  <TableCell><button type="button" className="font-mono text-xs hover:underline" onClick={() => { const n = { ...form, reason: e.reason }; setForm(n); setF(n); }}>{e.reason}</button></TableCell>
                  <TableCell>{fmtDelta(e.delta)}</TableCell>
                  <TableCell><code className="text-xs">{e.ref || "—"}</code></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtBal(e.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
    </div>
  );
}

