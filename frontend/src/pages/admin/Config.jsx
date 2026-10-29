import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FilePlus2, Send, Check, X, Rocket, History, Save } from "lucide-react";
import { toast } from "sonner";
import { adminApi, qs } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, usePaged, ListState, StatusBadge, fmtTime, Loading, ErrorBlock, Empty, Panel } from "@/components/admin/kit";
import { ConfirmDialog, useConfirm } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const val = (v) => (v === undefined ? <em className="text-muted-foreground">absent</em> : <code className="break-all text-xs">{JSON.stringify(v)}</code>);

export function DiffTable({ diff }) {
  if (!diff.changes.length) return <Empty testid="config-diff-empty">No differences from the published version v{diff.against}.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table data-testid="config-diff-table">
        <TableHeader><TableRow><TableHead>Path</TableHead><TableHead>Published v{diff.against}</TableHead><TableHead>This version</TableHead></TableRow></TableHeader>
        <TableBody>
          {diff.changes.map((c) => (
            <TableRow key={c.path} data-testid={`config-diff-row-${c.path}`}>
              <TableCell><code className="text-xs font-bold">{c.path}</code></TableCell>
              <TableCell className="bg-red-500/10 text-red-200">{val(c.before)}</TableCell>
              <TableCell className="bg-emerald-500/10 text-emerald-200">{val(c.after)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ConfigVersions() {
  const { can } = useAdmin();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const paged = usePaged((c) => `/config/versions${qs({ limit: 20, cursor: c })}`, []);
  const newDraft = async () => {
    setBusy(true);
    try {
      const d = await adminApi.post("/config/drafts", { note: "New draft" });
      nav(`/admin/config/${d.version}`);
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };
  return (
    <div data-testid="admin-config">
      <PageHeader title="Remote config" description="Draft → approval (another admin) → publish. Published versions are immutable; roll back by republishing an older version." actions={can("config:edit") && <Button onClick={newDraft} disabled={busy} data-testid="config-new-draft-btn"><FilePlus2 className="mr-1 h-4 w-4" aria-hidden /> New draft</Button>} />
      <ListState paged={paged} empty="No config versions.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="config-versions-table">
            <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead><TableHead>Author</TableHead><TableHead>Created</TableHead><TableHead>Published</TableHead></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((v) => (
                <TableRow key={v.version} data-testid={`config-version-row-${v.version}`}>
                  <TableCell><Link to={`/admin/config/${v.version}`} className="font-bold text-[#4da3ff] hover:underline" data-testid={`config-version-link-${v.version}`}>v{v.version}</Link></TableCell>
                  <TableCell><StatusBadge status={v.status} testid={`config-version-status-${v.version}`} /></TableCell>
                  <TableCell className="max-w-xs text-sm">{v.note || "—"}{v.rollback_of && <span className="ml-1 text-xs text-amber-300">(rollback of v{v.rollback_of})</span>}{v.kind === "quick_toggle" && <span className="ml-1 text-xs text-sky-300">(quick toggle)</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{v.author || "system"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{fmtTime(v.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{v.published_at ? fmtTime(v.published_at) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
    </div>
  );
}

function JsonEditor({ doc, onSaved }) {
  const [text, setText] = useState(() => JSON.stringify(doc.data, null, 2));
  const [note, setNote] = useState(doc.note || "");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return setErr(`Invalid JSON: ${e.message}`);
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.put(`/config/drafts/${doc.version}`, { data, note });
      toast.success("Draft saved");
      onSaved();
    } catch (e) {
      setErr(e.details?.errors?.join("; ") || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Edit draft (JSON)" testid="config-json-editor">
      <Label htmlFor="config-note" className="text-xs text-muted-foreground">Note</Label>
      <input id="config-note" className="mb-3 mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} data-testid="config-note-input" />
      <Label htmlFor="config-json" className="sr-only">Config JSON</Label>
      <Textarea id="config-json" rows={18} spellCheck={false} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} data-testid="config-json-input" />
      {err && <p role="alert" className="mt-2 text-sm text-red-300" data-testid="config-json-error">{err}</p>}
      <Button className="mt-3" onClick={save} disabled={busy} data-testid="config-save-draft-btn"><Save className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save draft"}</Button>
    </Panel>
  );
}

export function ConfigVersion() {
  const { v } = useParams();
  const { can, admin } = useAdmin();
  const nav = useNavigate();
  const doc = useAsync(() => adminApi.get(`/config/versions/${v}`), [v]);
  const diff = useAsync(() => adminApi.get(`/config/versions/${v}/diff`), [v]);
  const c = useConfirm();
  const [busy, setBusy] = useState(false);
  if (doc.loading && !doc.data) return <Loading />;
  if (doc.error) return <ErrorBlock error={doc.error} onRetry={doc.reload} />;
  const d = doc.data;
  const live = diff.data?.against;
  const reloadAll = () => { doc.reload(); diff.reload(); };
  const act = async (path, body, msg) => {
    setBusy(true);
    try {
      await adminApi.post(`/config/versions/${v}/${path}`, body);
      toast.success(msg);
      reloadAll();
    } catch (e) {
      toast.error(e.message, { id: "config-action-error" });
    } finally {
      setBusy(false);
    }
  };
  const turnsMaintOn = d.data.remote?.maintenance && diff.data?.changes.some((x) => x.path === "remote.maintenance");
  const stale = d.base_version != null && live != null && d.base_version !== live;
  const mine = admin.admin_id === d.author || admin.admin_id === d.submitted_by;
  return (
    <div data-testid="admin-config-version">
      <Link to="/admin/config" className="mb-3 inline-flex items-center gap-1 text-sm text-[#4da3ff] hover:underline" data-testid="config-back-link"><ArrowLeft className="h-4 w-4" aria-hidden /> All versions</Link>
      <PageHeader
        title={`Config v${d.version}`}
        testid="config-version-title"
        description={`${d.note || "No note"} · author ${d.author || "system"}${d.base_version ? ` · based on v${d.base_version}` : ""}`}
        actions={
          <>
            <StatusBadge status={d.status} testid="config-version-status" />
            {d.status === "draft" && can("config:edit") && <Button disabled={busy} onClick={() => act("submit", {}, "Submitted for approval")} data-testid="config-submit-btn"><Send className="mr-1 h-4 w-4" aria-hidden /> Request approval</Button>}
            {d.status === "pending_approval" && can("config:approve") && (
              <>
                <Button disabled={busy} onClick={() => act("approve", {}, "Approved")} title={mine ? "You authored this — another admin must approve" : undefined} data-testid="config-approve-btn"><Check className="mr-1 h-4 w-4" aria-hidden /> Approve</Button>
                <Button variant="secondary" disabled={busy} onClick={() => c.ask({ title: `Reject v${d.version}?`, description: "Rejected versions can't be published.", confirmLabel: "Reject", reason: true, reasonLabel: "Why", testid: "config-reject-dialog", onConfirm: async (note) => { await adminApi.post(`/config/versions/${v}/reject`, { note }); toast.success("Rejected"); reloadAll(); } })} data-testid="config-reject-btn"><X className="mr-1 h-4 w-4" aria-hidden /> Reject</Button>
              </>
            )}
            {d.status === "approved" && can("config:publish") && (
              <Button disabled={busy} onClick={() => c.ask({ title: `Publish v${d.version}?`, description: `${diff.data?.changes.length ?? "?"} change(s) go live; the app picks them up on its next config fetch.${stale ? ` Warning: this draft was based on v${d.base_version} but v${live} is live — later changes will be replaced.` : ""}${turnsMaintOn ? " This turns MAINTENANCE ON — players can't play." : ""}`, confirmLabel: "Publish", typed: turnsMaintOn || stale ? "PUBLISH" : undefined, testid: "config-publish-dialog", onConfirm: async () => { await adminApi.post(`/config/versions/${v}/publish`, { confirm: true }); toast.success(`v${d.version} is live`); reloadAll(); } })} data-testid="config-publish-btn"><Rocket className="mr-1 h-4 w-4" aria-hidden /> Publish</Button>
            )}
            {d.published_at && d.version !== live && can("config:publish") && (
              <Button variant="destructive" disabled={busy} onClick={() => c.ask({ title: `Roll back to v${d.version}?`, description: `Republishes v${d.version}'s data as a NEW version, replacing live v${live}. The diff below shows what changes.`, confirmLabel: "Roll back", typed: "ROLLBACK", testid: "config-rollback-dialog", onConfirm: async () => { const r = await adminApi.post("/config/rollback", { version: d.version, confirm: true }); toast.success(`Rolled back — v${r.version} is live`); nav(`/admin/config/${r.version}`); } })} data-testid="config-rollback-btn"><History className="mr-1 h-4 w-4" aria-hidden /> Roll back to this</Button>
            )}
          </>
        }
      />
      {d.status === "pending_approval" && mine && <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="config-four-eyes-note">You authored or submitted this version. Four-eyes rule: another admin must approve it.</p>}
      {d.reject_note && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">Rejected: {d.reject_note}</p>}
      <Panel title={live != null ? `Preview: diff against published v${live}` : "Preview diff"} testid="config-diff-panel">
        {diff.loading && !diff.data && <Loading />}
        {diff.error && <ErrorBlock error={diff.error} onRetry={diff.reload} />}
        {diff.data && <DiffTable diff={diff.data} />}
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Lifecycle" className="lg:col-span-1">
          <dl className="space-y-1 text-xs">
            {[["Created", d.created_at], ["Submitted", d.submitted_at], ["Approved", d.approved_at], ["Published", d.published_at]].map(([l, t]) => (
              <div key={l} className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd>{fmtTime(t)}</dd></div>
            ))}
            {d.approver && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Approver</dt><dd className="font-mono">{d.approver}</dd></div>}
            {d.publisher && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Publisher</dt><dd className="font-mono">{d.publisher}</dd></div>}
          </dl>
        </Panel>
        <div className="lg:col-span-2">
          {d.status === "draft" && can("config:edit") ? <JsonEditor key={d.updated_at || d.created_at} doc={d} onSaved={reloadAll} /> : (
            <Panel title="Data (read-only)"><pre className="max-h-[480px] overflow-auto rounded-lg bg-[#070D20] p-3 text-xs" data-testid="config-data-view">{JSON.stringify(d.data, null, 2)}</pre></Panel>
          )}
        </div>
      </div>
      <ConfirmDialog {...c.props} />
    </div>
  );
}
