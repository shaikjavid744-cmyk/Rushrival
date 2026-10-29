import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, API_V1 } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock, Panel, fmtNum } from "@/components/admin/kit";
import { EditableTable, draftFrom } from "@/components/admin/configTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const KINDS = [["character", "Characters"], ["board", "Boards"], ["world", "Worlds"]];

const toRows = (items) =>
  Object.entries(items || {}).map(([id, it]) => ({
    id,
    price_type: it.price === null || it.price === undefined ? "free" : it.price === "ad" ? "ad" : it.price.currency,
    amount: typeof it.price === "object" && it.price ? it.price.amount : undefined,
    unlock_level: it.unlock_level ?? undefined,
    enabled: it.enabled !== false,
  }));
const fromRows = (rows) =>
  Object.fromEntries(rows.map((r) => [r.id, { price: r.price_type === "free" ? null : r.price_type === "ad" ? "ad" : { currency: r.price_type, amount: r.amount ?? 0 }, unlock_level: r.unlock_level ?? null, enabled: r.enabled !== false }]));

const COLS = [
  { key: "id", label: "Item", render: (r) => <span className="font-bold capitalize">{r.id}</span> },
  { key: "price_type", label: "Price", type: "select", options: [["free", "Free"], ["ad", "Watch ads"], ["coins", "Coins"], ["gems", "Gems"]] },
  { key: "amount", label: "Amount", type: "number", disabled: (r) => !["coins", "gems"].includes(r.price_type) },
  { key: "unlock_level", label: "Unlock level", type: "number" },
  { key: "enabled", label: "Enabled", type: "bool" },
];

function Shop() {
  const { data, error, loading, reload } = useAsync(() => fetch(`${API_V1}/catalog`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load the shop")))), []);
  return (
    <Panel title="Store products" testid="catalog-products-panel">
      <p className="mb-3 text-xs text-muted-foreground">In-game shop products (soft-currency) are defined in server code and aren't part of remote config, so they're read-only here. Real-money Google Play product prices are set in Play Console.</p>
      {loading && <Loading />}
      {error && <ErrorBlock error={error} onRetry={reload} />}
      {data && (
        <ul className="grid gap-2 sm:grid-cols-3" data-testid="catalog-products">
          {Object.entries(data.shop || {}).map(([id, p]) => (
            <li key={id} className="rounded-lg border p-3 text-sm"><p className="font-bold">{id}</p><p className="text-muted-foreground">{fmtNum(p.amount)} {p.currency} → {Object.entries(p.grant).map(([k, v]) => `${fmtNum(v)} ${k}`).join(", ")}</p></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Catalogue() {
  const { can } = useAdmin();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/catalog"), []);
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = can("catalog:edit") && can("config:edit");
  useEffect(() => {
    if (data) setRows(Object.fromEntries(KINDS.map(([k]) => [k, toRows(data.catalog[k])])));
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  if (!rows) return <Loading />;
  const save = async () => {
    setBusy(true);
    try {
      const d = await draftFrom((cfg) => KINDS.forEach(([k]) => (cfg.catalog[k] = fromRows(rows[k]))), note || "Catalogue edit");
      toast.success(`Draft v${d.version} created — review the diff and request approval`);
      nav(`/admin/config/${d.version}`);
    } catch (e) {
      toast.error(e.details?.errors?.join("; ") || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="admin-catalogue">
      <PageHeader title="Catalogue" description={`Characters, boards and worlds from published config v${data.version}. Changes are saved as a draft and go live only after approval + publish.`} />
      <Tabs defaultValue="character">
        <TabsList>{KINDS.map(([k, l]) => <TabsTrigger key={k} value={k} data-testid={`catalog-tab-${k}`}>{l}</TabsTrigger>)}</TabsList>
        {KINDS.map(([k]) => (
          <TabsContent key={k} value={k} className="mt-4">
            <EditableTable testid={`catalog-${k}-table`} rows={rows[k]} columns={COLS} readOnly={!editable} onChange={(r) => setRows({ ...rows, [k]: r })} />
          </TabsContent>
        ))}
      </Tabs>
      {editable ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-[260px] flex-1 space-y-1"><Label htmlFor="catalog-note" className="text-xs text-muted-foreground">Change note</Label><Input id="catalog-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Zoe price 20,000" data-testid="catalog-note-input" /></div>
          <Button onClick={save} disabled={busy} data-testid="catalog-save-draft-btn"><FilePlus2 className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save as draft"}</Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="catalog-readonly-note">Read-only — editing needs catalog:edit and config:edit.</p>
      )}
      <div className="mt-6"><Shop /></div>
    </div>
  );
}
