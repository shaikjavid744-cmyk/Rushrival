import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, StatusBadge, fmtTime, Panel } from "@/components/admin/kit";
import { ConfirmDialog, useConfirm } from "@/components/admin/ConfirmDialog";
import { FilterSelect } from "@/pages/admin/Reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLES = [["owner", "Owner"], ["liveops_editor", "LiveOps Editor"], ["publisher", "Publisher"], ["support", "Support"], ["finance", "Finance"], ["moderator", "Moderator"], ["viewer", "Viewer"]];

function CreateAdmin({ onCreated }) {
  const [f, setF] = useState({ email: "", name: "", password: "", role: "viewer" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await adminApi.post("/admins", f);
      toast.success(`Admin ${f.email} created — they must set up TOTP on first sign-in`);
      setF({ email: "", name: "", password: "", role: "viewer" });
      onCreated();
    } catch (e2) {
      setErr(e2.code === "validation_error" ? "Check the fields: valid email, name, password of 12+ characters." : e2.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Create admin" testid="create-admin-panel">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["email", "Email", "email"], ["name", "Name", "text"], ["password", "Temporary password (12+)", "password"]].map(([k, l, t]) => (
          <div key={k} className="space-y-1"><Label htmlFor={`new-admin-${k}`} className="text-xs text-muted-foreground">{l}</Label><Input id={`new-admin-${k}`} type={t} required minLength={k === "password" ? 12 : 1} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} autoComplete="off" data-testid={`new-admin-${k}-input`} /></div>
        ))}
        <FilterSelect id="new-admin-role" label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} testid="new-admin-role-select" />
        <div className="flex items-end"><Button type="submit" disabled={busy} data-testid="create-admin-btn"><UserPlus className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Creating…" : "Create"}</Button></div>
      </form>
      {err && <p role="alert" className="mt-3 text-sm text-red-300" data-testid="create-admin-error">{err}</p>}
    </Panel>
  );
}

export default function Admins() {
  const { admin: me } = useAdmin();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/admins"), []);
  const c = useConfirm();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  const patch = (a, body, msg) => c.ask({
    title: msg.title, description: msg.description, confirmLabel: msg.label, destructive: msg.destructive ?? true, testid: "admin-edit-dialog",
    onConfirm: async () => { await adminApi.patch(`/admins/${a.admin_id}`, body); toast.success("Saved"); reload(); },
  });
  return (
    <div data-testid="admin-admins">
      <PageHeader title="Admins" description="Staff accounts are separate from players. Every account must use TOTP." />
      <CreateAdmin onCreated={reload} />
      <div className="mt-6 overflow-x-auto rounded-xl border">
        <Table data-testid="admins-table">
          <TableHeader><TableRow><TableHead>Admin</TableHead><TableHead>Role</TableHead><TableHead>MFA</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data.items.map((a) => (
              <TableRow key={a.admin_id} data-testid={`admin-row-${a.admin_id}`}>
                <TableCell><span className="font-bold">{a.name}</span>{a.admin_id === me.admin_id && <span className="ml-1 text-xs text-amber-300">(you)</span>}<div className="text-xs text-muted-foreground">{a.email}</div></TableCell>
                <TableCell className="w-48">
                  <label htmlFor={`role-${a.admin_id}`} className="sr-only">Role for {a.email}</label>
                  <select id={`role-${a.admin_id}`} value={a.role} className="h-9 w-full rounded-md border bg-background px-2 text-sm" onChange={(e) => patch(a, { role: e.target.value }, { title: `Change ${a.email} to ${ROLES.find((r) => r[0] === e.target.value)[1]}?`, description: "Their permissions change on their next request.", label: "Change role", destructive: false })} data-testid={`admin-role-select-${a.admin_id}`}>
                    {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </TableCell>
                <TableCell><StatusBadge status={a.mfa_enrolled ? "enrolled" : "pending"} /></TableCell>
                <TableCell><StatusBadge status={a.disabled ? "disabled" : "active"} /></TableCell>
                <TableCell className="whitespace-nowrap text-xs">{fmtTime(a.created_at)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button size="sm" variant={a.disabled ? "secondary" : "destructive"} onClick={() => patch(a, { disabled: !a.disabled }, a.disabled ? { title: `Enable ${a.email}?`, label: "Enable", destructive: false } : { title: `Disable ${a.email}?`, description: "All their sessions are revoked immediately.", label: "Disable admin" })} data-testid={`admin-toggle-disabled-btn-${a.admin_id}`}>{a.disabled ? "Enable" : "Disable"}</Button>
                    <Button size="sm" variant="secondary" onClick={() => c.ask({ title: `Reset MFA for ${a.email}?`, description: "Their TOTP secret is removed and sessions revoked. They must enrol again at next sign-in.", confirmLabel: "Reset MFA", testid: "admin-reset-mfa-dialog", onConfirm: async () => { await adminApi.post(`/admins/${a.admin_id}/reset-mfa`); toast.success("MFA reset"); reload(); } })} data-testid={`admin-reset-mfa-btn-${a.admin_id}`}>Reset MFA</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Panel title="Role permissions" className="mt-6">
        <dl className="grid gap-3 text-xs md:grid-cols-2">
          {Object.entries(data.roles).filter(([r]) => r !== "owner").map(([r, perms]) => (
            <div key={r}><dt className="font-bold text-white">{ROLES.find((x) => x[0] === r)?.[1] || r}</dt><dd className="text-muted-foreground">{perms.join(", ")}</dd></div>
          ))}
          <div><dt className="font-bold text-white">Owner</dt><dd className="text-muted-foreground">Every permission, including admins and audit.</dd></div>
        </dl>
      </Panel>
      <ConfirmDialog {...c.props} />
    </div>
  );
}
