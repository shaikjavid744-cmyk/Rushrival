import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { adminApi, qs } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, usePaged, ListState, StatusBadge, fmtTime, Loading, ErrorBlock, Panel } from "@/components/admin/kit";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FilterSelect } from "@/pages/admin/Reports";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TicketList() {
  const [status, setStatus] = useState("");
  const nav = useNavigate();
  const paged = usePaged((c) => `/tickets${qs({ status, limit: 20, cursor: c })}`, [status]);
  return (
    <div data-testid="admin-tickets">
      <PageHeader title="Support tickets" description="Tickets from the app and the website contact form." />
      <div className="mb-4 w-48"><FilterSelect id="ticket-status" label="Status" value={status} onChange={setStatus} options={[["", "All"], ["open", "Open"], ["replied", "Replied"], ["closed", "Closed"]]} testid="tickets-status-filter" /></div>
      <ListState paged={paged} empty="No tickets.">
        <div className="overflow-x-auto rounded-xl border">
          <Table data-testid="tickets-table">
            <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>From</TableHead><TableHead>Category</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {paged.items.map((t) => (
                <TableRow key={t.ticket_no} className="cursor-pointer" onClick={() => nav(`/admin/tickets/${t.ticket_no}`)} data-testid={`ticket-row-${t.ticket_no}`}>
                  <TableCell><Link to={`/admin/tickets/${t.ticket_no}`} className="font-bold text-[#4da3ff] hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`ticket-link-${t.ticket_no}`}>{t.ticket_no}</Link><div className="text-xs text-muted-foreground">{t.source || "app"}</div></TableCell>
                  <TableCell className="text-sm">{t.name || "—"}<div className="text-xs text-muted-foreground">{t.email || t.user_id || "—"}</div></TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell className="max-w-sm"><span className="line-clamp-2">{t.message}</span></TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="whitespace-nowrap">{fmtTime(t.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
    </div>
  );
}

export function TicketDetail() {
  const { no } = useParams();
  const { admin, can } = useAdmin();
  const { data: t, error, loading, reload, setData } = useAsync(() => adminApi.get(`/tickets/${no}`), [no]);
  const admins = useAsync(() => (can("admins:manage_admins") ? adminApi.get("/admins") : Promise.resolve({ items: [] })), []);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  if (loading && !t) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  const edit = can("tickets:edit") && t.status !== "closed";
  const assign = async (id) => {
    try {
      setData(await adminApi.post(`/tickets/${no}/assign`, { admin_id: id }));
      toast.success("Ticket assigned");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await adminApi.post(`/tickets/${no}/reply`, { message: reply.trim() });
      setData(r.ticket);
      setReply("");
      toast.success(`Reply sent${r.inbox ? " · posted to the player's Inbox" : ""}${r.email_sent ? " · emailed" : ` · email not sent${r.email_error ? ` (${r.email_error.replace(/_/g, " ")})` : ""}`}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const assigneeName = (admins.data?.items || []).find((a) => a.admin_id === t.assignee)?.email || (t.assignee === admin.admin_id ? "You" : t.assignee);
  return (
    <div data-testid="admin-ticket-detail">
      <Link to="/admin/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-[#4da3ff] hover:underline" data-testid="ticket-back-link"><ArrowLeft className="h-4 w-4" aria-hidden /> Tickets</Link>
      <PageHeader title={`Ticket ${t.ticket_no}`} testid="ticket-detail-title" description={`${t.category} · ${t.source || "app"} · ${fmtTime(t.created_at)}`} actions={<StatusBadge status={t.status} testid="ticket-status-badge" />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Panel title={`From ${t.name || t.email || "player"}`}>
            <p className="whitespace-pre-line text-sm" data-testid="ticket-message">{t.message}</p>
          </Panel>
          {(t.replies || []).map((r, i) => (
            <Panel key={i} title={`Reply · ${fmtTime(r.at)}`} className="border-[#1F8BFF]/50" testid={`ticket-reply-${i}`}>
              <p className="whitespace-pre-line text-sm">{r.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">{r.inbox ? "Sent to Inbox" : "No linked account (no Inbox)"} · {r.email_sent ? "Emailed" : `Email not sent${r.email_error ? ` — ${r.email_error.replace(/_/g, " ")}` : ""}`}</p>
            </Panel>
          ))}
          {edit && (
            <Panel title="Reply">
              <Label htmlFor="ticket-reply" className="sr-only">Reply message</Label>
              <Textarea id="ticket-reply" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply. It goes to the player's Inbox (if linked) and by email." data-testid="ticket-reply-input" />
              <Button className="mt-3" onClick={send} disabled={busy || reply.trim().length < 2} data-testid="ticket-reply-send-btn"><Send className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Sending…" : "Send reply"}</Button>
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          <Panel title="Details">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Email</dt><dd>{t.email || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Player</dt><dd>{t.user_id ? <Link className="text-[#4da3ff] hover:underline" to={`/admin/players/${t.user_id}`}>{t.user_id}</Link> : "Not linked"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Assignee</dt><dd data-testid="ticket-assignee">{t.assignee ? assigneeName : "Unassigned"}</dd></div>
            </dl>
          </Panel>
          {edit && (
            <Panel title="Actions">
              <div className="space-y-2">
                {admins.data?.items?.length > 0 ? (
                  <FilterSelect id="ticket-assign" label="Assign to" value={t.assignee || ""} onChange={(v) => v && assign(v)} options={[["", "Choose admin…"], ...admins.data.items.filter((a) => a.permissions.includes("tickets:edit") && !a.disabled).map((a) => [a.admin_id, a.email])]} testid="ticket-assign-select" />
                ) : (
                  <Button variant="secondary" className="w-full" disabled={t.assignee === admin.admin_id} onClick={() => assign(admin.admin_id)} data-testid="ticket-assign-me-btn"><UserCheck className="mr-1 h-4 w-4" aria-hidden /> Assign to me</Button>
                )}
                <Button variant="destructive" className="w-full" onClick={() => setClosing(true)} data-testid="ticket-close-btn"><XCircle className="mr-1 h-4 w-4" aria-hidden /> Close ticket</Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog open={closing} onOpenChange={setClosing} testid="ticket-close-dialog" title={`Close ${t.ticket_no}?`} description="The ticket is marked closed. You can't reply after closing." confirmLabel="Close ticket" onConfirm={async () => { setData(await adminApi.post(`/tickets/${no}/close`)); toast.success("Ticket closed"); }} />
    </div>
  );
}
