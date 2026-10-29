import { useEffect, useRef, useState } from "react";
import { Plus, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Empty, StatusBadge, fmtTime } from "@/components/admin/kit";
import { ConfirmDialog, useConfirm } from "@/components/admin/ConfirmDialog";
import { ArticleBody } from "@/pages/site/News";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SPEC = {
  news: { key: "news_id", label: "article", fields: [["title", "Title", "input"], ["slug", "URL slug", "input"], ["summary", "Summary", "textarea2"], ["body", "Body (blank line = new paragraph, “## ” = heading)", "textarea"], ["image_url", "Image URL (optional)", "input"]], blank: { title: "", slug: "", summary: "", body: "", image_url: "" } },
  faq: { key: "faq_id", label: "FAQ item", fields: [["question", "Question", "input"], ["answer", "Answer", "textarea"], ["order", "Order", "number"]], blank: { question: "", answer: "", order: 0 } },
};
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function Editor({ kind, item, open, onOpenChange, onSaved }) {
  const spec = SPEC[kind];
  const [f, setF] = useState(spec.blank);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF(item ? Object.fromEntries(Object.keys(spec.blank).map((k) => [k, item[k] ?? spec.blank[k]])) : spec.blank);
      setErr(null);
    }
  }, [open, item, spec.blank]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = { ...f };
      if (kind === "news" && !body.image_url) body.image_url = null;
      if (kind === "faq") body.order = parseInt(body.order, 10) || 0;
      if (item) {
        delete body.slug;
        await adminApi.patch(`/${kind}/${item[spec.key]}`, body);
      } else await adminApi.post(`/${kind}`, body);
      toast.success(item ? "Saved" : "Draft created");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setErr(e.code === "validation_error" ? "Check the fields: each needs at least 3 characters; slug uses lowercase letters, numbers and dashes." : e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-2 bg-card text-white sm:max-w-2xl" data-testid={`${kind}-editor-dialog`}>
        <DialogHeader><DialogTitle>{item ? `Edit ${spec.label}` : `New ${spec.label}`}</DialogTitle><DialogDescription className="text-slate-300">Saved as a draft. It appears on the website only after you publish it.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {spec.fields.map(([k, l, t]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`${kind}-${k}`}>{l}</Label>
              {t.startsWith("textarea") ? (
                <Textarea id={`${kind}-${k}`} rows={t === "textarea" ? 8 : 2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`${kind}-${k}-input`} />
              ) : (
                <Input id={`${kind}-${k}`} type={t === "number" ? "number" : "text"} value={f[k] ?? ""} disabled={k === "slug" && !!item}
                  onChange={(e) => setF({ ...f, [k]: e.target.value, ...(k === "title" && !item && (!f.slug || f.slug === slugify(f.title)) ? { slug: slugify(e.target.value) } : {}) })} data-testid={`${kind}-${k}-input`} />
              )}
            </div>
          ))}
        </div>
        {err && <p role="alert" className="text-sm text-red-300" data-testid={`${kind}-editor-error`}>{err}</p>}
        <DialogFooter className="gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)} data-testid={`${kind}-editor-cancel-btn`}>Cancel</Button><Button onClick={save} disabled={busy} data-testid={`${kind}-editor-save-btn`}>{busy ? "Saving…" : "Save draft"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ kind, item, onOpenChange }) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-2 border-[#1F8BFF] bg-[#0A1128] text-white sm:max-w-2xl" data-testid={`${kind}-preview-dialog`}>
        <DialogHeader><DialogTitle className="text-xs uppercase tracking-wide text-[#FFC107]">Website preview</DialogTitle></DialogHeader>
        {item && kind === "news" && (
          <article>
            <h2 className="font-display text-4xl">{item.title}</h2>
            <p className="mt-3 text-lg text-[#E1E7F5]">{item.summary}</p>
            <div className="mt-6"><ArticleBody body={item.body} /></div>
          </article>
        )}
        {item && kind === "faq" && (
          <div className="rr-card p-5"><p className="font-display text-xl">{item.question}</p><p className="mt-3 whitespace-pre-line text-[#d7e0f4]">{item.answer}</p></div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContentList({ kind }) {
  const { can } = useAdmin();
  const spec = SPEC[kind];
  const { data, error, loading, reload } = useAsync(() => adminApi.get(`/${kind}`), [kind]);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [inbox, setInbox] = useState(false);
  const inboxRef = useRef(false);
  const setInboxBoth = (v) => {
    inboxRef.current = v;
    setInbox(v);
  };
  const c = useConfirm();
  const id = (x) => x[spec.key];
  const doPost = (x, action, body, msg) => async () => {
    await adminApi.post(`/${kind}/${id(x)}/${action}`, body);
    toast.success(msg);
    reload();
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  return (
    <div className="space-y-3">
      {can("content:edit") && <Button onClick={() => setEdit({ item: null })} data-testid={`${kind}-new-btn`}><Plus className="mr-1 h-4 w-4" aria-hidden /> New {spec.label}</Button>}
      {!data.items.length && <Empty testid={`${kind}-admin-empty`}>No {spec.label}s yet.</Empty>}
      <ul className="space-y-2" data-testid={`${kind}-admin-list`}>
        {data.items.map((x) => (
          <li key={id(x)} className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between" data-testid={`${kind}-admin-item-${id(x)}`}>
            <div className="min-w-0">
              <p className="font-bold">{x.title || x.question}</p>
              <p className="truncate text-xs text-muted-foreground">{kind === "news" ? `/news/${x.slug} · ` : `order ${x.order} · `}updated {fmtTime(x.updated_at)}{x.published_at ? ` · published ${fmtTime(x.published_at)}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={x.status} testid={`${kind}-status-${id(x)}`} />
              <Button size="sm" variant="ghost" onClick={() => setPreview(x)} data-testid={`${kind}-preview-btn-${id(x)}`}><Eye className="mr-1 h-4 w-4" aria-hidden /> Preview</Button>
              {can("content:edit") && <Button size="sm" variant="ghost" onClick={() => setEdit({ item: x })} data-testid={`${kind}-edit-btn-${id(x)}`}><Pencil className="mr-1 h-4 w-4" aria-hidden /> Edit</Button>}
              {can("content:publish") && x.status !== "published" && (
                <Button size="sm" onClick={() => { setInboxBoth(false); c.ask({ title: `Publish “${x.title || x.question}”?`, description: `It appears on the public website${kind === "news" ? " News page" : " FAQ"} immediately.`, confirmLabel: "Publish", destructive: false, testid: `${kind}-publish-dialog`, onConfirm: async () => { const ib = kind === "news" && inboxRef.current; await adminApi.post(`/${kind}/${id(x)}/publish`, { inbox: ib }); toast.success(ib ? "Published + posted to Inbox" : "Published"); reload(); } }); }} data-testid={`${kind}-publish-btn-${id(x)}`}>Publish</Button>
              )}
              {can("content:publish") && x.status === "published" && (
                <Button size="sm" variant="secondary" onClick={() => c.ask({ title: "Unpublish?", description: "It disappears from the website (and the in-game Inbox announcement is removed).", confirmLabel: "Unpublish", testid: `${kind}-unpublish-dialog`, onConfirm: doPost(x, "unpublish", {}, "Unpublished") })} data-testid={`${kind}-unpublish-btn-${id(x)}`}>Unpublish</Button>
              )}
              {can("content:publish") && (
                <Button size="sm" variant="destructive" onClick={() => c.ask({ title: "Delete permanently?", description: "This can't be undone (an audit entry keeps the old content).", confirmLabel: "Delete", typed: "DELETE", testid: `${kind}-delete-dialog`, onConfirm: doPost(x, "delete", { confirm: true }, "Deleted") })} data-testid={`${kind}-delete-btn-${id(x)}`}>Delete</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Editor kind={kind} item={edit?.item} open={!!edit} onOpenChange={(o) => !o && setEdit(null)} onSaved={reload} />
      <Preview kind={kind} item={preview} onOpenChange={(o) => !o && setPreview(null)} />
      <ConfirmDialog {...c.props}>
        {c.props.testid === "news-publish-dialog" && (
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={inbox} onCheckedChange={(v) => setInboxBoth(!!v)} data-testid="news-publish-inbox-checkbox" /> Also post an announcement to the in-game Inbox</label>
        )}
      </ConfirmDialog>
    </div>
  );
}

export default function Content() {
  return (
    <div data-testid="admin-content">
      <PageHeader title="News & FAQ" description="Create drafts, preview, then publish to the website. News can also post to the in-game Inbox." />
      <Tabs defaultValue="news">
        <TabsList><TabsTrigger value="news" data-testid="content-tab-news">News</TabsTrigger><TabsTrigger value="faq" data-testid="content-tab-faq">FAQ</TabsTrigger></TabsList>
        <TabsContent value="news" className="mt-4"><ContentList kind="news" /></TabsContent>
        <TabsContent value="faq" className="mt-4"><ContentList kind="faq" /></TabsContent>
      </Tabs>
    </div>
  );
}
