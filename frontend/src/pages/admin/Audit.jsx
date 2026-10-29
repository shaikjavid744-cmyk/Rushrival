import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { adminRequest, adminApi, qs } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, usePaged, ListState, fmtTime } from "@/components/admin/kit";
import { FilterSelect } from "@/pages/admin/Reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { admin_id: "", action: "", q: "" };
const short = (v) => (v === null || v === undefined ? "—" : JSON.stringify(v));

export default function Audit() {
  const { can } = useAdmin();
  const [form, setForm] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const admins = useAsync(() => (can("admins:manage_admins") ? adminApi.get("/admins") : Promise.resolve({ items: [] })), []);
  const paged = usePaged((c) => `/audit${qs({ ...f, limit: 50, cursor: c })}`, [f]);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminRequest("GET", `/audit/export.csv${qs(f)}`, undefined, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `rr-audit-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div data-testid="admin-audit">
      <PageHeader title="Audit log" description="Immutable record of every privileged action, with before/after values." actions={<Button onClick={exportCsv} disabled={exporting} data-testid="audit-export-btn"><Download className="mr-1 h-4 w-4" aria-hidden /> {exporting ? "Exporting…" : "Export CSV"}</Button>} />
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setF(form); }} data-testid="audit-filters">
        {admins.data?.items?.length ? (
          <FilterSelect id="audit-admin" label="Admin" value={form.admin_id} onChange={(v) => setForm({ ...form, admin_id: v })} options={[["", "All admins"], ...admins.data.items.map((a) => [a.admin_id, a.email])]} testid="audit-admin-filter" />
        ) : (
          <div className="space-y-1"><Label htmlFor="audit-admin-id" className="text-xs text-muted-foreground">Admin id</Label><Input id="audit-admin-id" value={form.admin_id} onChange={(e) => setForm({ ...form, admin_id: e.target.value })} data-testid="audit-admin-filter" /></div>
        )}
        <div className="space-y-1"><Label htmlFor="audit-action" className="text-xs text-muted-foreground">Action starts with</Label><Input id="audit-action" placeholder="e.g. config. or players.ban" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} data-testid="audit-action-filter" /></div>
        <div className="space-y-1"><Label htmlFor="audit-q" className="text-xs text-muted-foreground">Search target / email</Label><Input id="audit-q" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} data-testid="audit-q-filter" /></div>
        <div className="flex items-end gap-2"><Button type="submit" data-testid="audit-apply-btn">Apply</Button><Button type="button" variant="ghost" onClick={() => { setForm(EMPTY); setF(EMPTY); }} data-testid="audit-reset-btn">Reset</Button></div>
      </form>
      <ListState paged={paged} empty="No audit entries match.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="audit-table">
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Admin</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Before → After</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((e) => (
                <TableRow key={e.audit_id} data-testid={`audit-row-${e.audit_id}`}>
                  <TableCell className="whitespace-nowrap">{fmtTime(e.time)}</TableCell>
                  <TableCell className="text-xs">{e.admin_email}</TableCell>
                  <TableCell><code className="text-xs">{e.action}</code></TableCell>
                  <TableCell><code className="text-xs">{e.target}</code></TableCell>
                  <TableCell className="max-w-md">
                    <button type="button" className="w-full text-left text-xs text-slate-300 hover:text-white" onClick={() => setOpen(open === e.audit_id ? null : e.audit_id)} aria-expanded={open === e.audit_id} data-testid={`audit-expand-${e.audit_id}`}>
                      {open === e.audit_id ? (
                        <span className="grid gap-1"><pre className="whitespace-pre-wrap break-all rounded bg-red-500/10 p-2">{JSON.stringify(e.before, null, 2)}</pre><pre className="whitespace-pre-wrap break-all rounded bg-emerald-500/10 p-2">{JSON.stringify(e.after, null, 2)}</pre></span>
                      ) : (
                        <span className="line-clamp-2 break-all">{short(e.before)} → {short(e.after)}</span>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">{e.ip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
    </div>
  );
}
