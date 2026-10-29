import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Panel } from "@/components/admin/kit";
import { draftFrom } from "@/components/admin/configTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  ["min_supported_version", "Minimum supported version", "Older app versions must update (\"Update required\" screen)."],
  ["latest_version", "Latest version", "Newer than the installed version → \"Update available\" banner."],
  ["store_url_android", "Google Play URL (website)", "Leave empty until the listing is live — the website shows \"Coming soon to Google Play\"."],
  ["store_url", "Store URL (in-app update button)", ""],
];

export default function Releases() {
  const { can } = useAdmin();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/release"), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const editable = can("release:edit") && can("config:edit");
  useEffect(() => {
    if (data) setF({ ...data, store_url: "" });
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  if (!f) return <Loading />;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await draftFrom((cfg) => {
        ["min_supported_version", "latest_version", "release_notes"].forEach((k) => (cfg.remote[k] = f[k] || ""));
        cfg.remote.store_url_android = f.store_url_android?.trim() || null;
        if (f.store_url?.trim()) cfg.remote.store_url = f.store_url.trim();
      }, `Release ${f.latest_version}`);
      toast.success(`Draft v${d.version} created — review and request approval`);
      nav(`/admin/config/${d.version}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="admin-releases">
      <PageHeader title="Releases" description="App versions, release notes and store links. Edits go through the remote-config draft → approval → publish workflow." />
      <form onSubmit={save}>
        <Panel title="Current release settings">
          <div className="grid gap-4 md:grid-cols-2">
            {FIELDS.map(([k, l, hint]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`rel-${k}`}>{l}</Label>
                <Input id={`rel-${k}`} value={f[k] ?? ""} placeholder={k === "store_url" ? "(unchanged)" : ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} disabled={!editable} data-testid={`release-${k}-input`} />
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              </div>
            ))}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="rel-notes">Release notes</Label>
              <Textarea id="rel-notes" rows={5} value={f.release_notes ?? ""} onChange={(e) => setF({ ...f, release_notes: e.target.value })} disabled={!editable} data-testid="release-notes-input" />
            </div>
          </div>
          {editable && <Button type="submit" className="mt-4" disabled={busy} data-testid="release-save-draft-btn"><FilePlus2 className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save as draft"}</Button>}
        </Panel>
      </form>
    </div>
  );
}
