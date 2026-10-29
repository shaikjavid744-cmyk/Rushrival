import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAdmin } from "@/lib/adminAuth";
import { PageHeader, Loading, ErrorBlock } from "@/components/admin/kit";
import { EditableTable, draftFrom } from "@/components/admin/configTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATS_M = [["runs", "runs"], ["coins", "coins"], ["distance", "distance"]];
const STATS_A = [["total_runs", "total_runs"], ["total_coins", "total_coins"], ["best_score", "best_score"]];
const WORLDS = ["city", "beach", "snow", "night", "temple", "lava"].map((w) => [w, w]);
const reward = (base) => [
  { key: `${base}.coins`, label: "Coins" },
  { key: `${base}.gems`, label: "Gems" },
].map((c) => ({ ...c, type: "number" }));

const goalCols = (stats) => [
  { key: "id", label: "Id", lockExisting: true },
  { key: "title", label: "Title", wide: true },
  { key: "stat", label: "Stat", type: "select", options: stats },
  { key: "target", label: "Target", type: "number" },
  ...reward("reward"),
];
const DAILY_COLS = [{ key: "__day", label: "Day", render: (r) => <span className="font-bold">Day {r.__day}</span> }, ...reward(""), { key: "hoverboards", label: "Hoverboards", type: "number" }].map((c) => ({ ...c, key: c.key.replace(/^\./, "") }));
const EVENT_COLS = [
  { key: "event_id", label: "Id", lockExisting: true },
  { key: "name", label: "Name", wide: true },
  { key: "world", label: "World", type: "select", options: WORLDS },
  { key: "description", label: "Description", wide: true },
  { key: "rule.target", label: "Goal (tokens)", type: "number" },
  ...reward("rewards"),
  { key: "starts_at", label: "Starts", type: "datetime" },
  { key: "ends_at", label: "Ends", type: "datetime" },
  { key: "enabled", label: "Enabled", type: "bool" },
];

const mark = (arr) => (arr || []).map((x) => ({ ...x, __existing: true }));
const clean = (arr) => arr.map(({ __existing, __day, ...x }) => x);

export default function LiveOps() {
  const { can } = useAdmin();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/catalog"), []);
  const [s, setS] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = can("liveops:edit") && can("config:edit");
  useEffect(() => {
    if (data) setS({ missions: mark(data.missions), achievements: mark(data.achievements), daily_rewards: data.daily_rewards.map((d, i) => ({ ...d, __day: i + 1 })), events: mark(data.events) });
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  if (!s) return <Loading />;
  const save = async () => {
    setBusy(true);
    try {
      const d = await draftFrom((cfg) => {
        cfg.missions = clean(s.missions);
        cfg.achievements = clean(s.achievements);
        cfg.daily_rewards = clean(s.daily_rewards);
        cfg.events = clean(s.events);
      }, note || "Live-ops edit");
      toast.success(`Draft v${d.version} created — review the diff and request approval`);
      nav(`/admin/config/${d.version}`);
    } catch (e) {
      toast.error(e.details?.errors?.join("; ") || e.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (rows) => setS({ ...s, [k]: rows });
  const now = Date.now();
  const tabs = [
    ["missions", "Daily missions", <EditableTable key="m" testid="liveops-missions-table" rows={s.missions} columns={goalCols(STATS_M)} onChange={set("missions")} readOnly={!editable} removable addRow={() => ({ id: `m_${Date.now().toString(36)}`, title: "", stat: "runs", target: 1, reward: { coins: 100 } })} />],
    ["achievements", "Achievements", <EditableTable key="a" testid="liveops-achievements-table" rows={s.achievements} columns={goalCols(STATS_A)} onChange={set("achievements")} readOnly={!editable} removable addRow={() => ({ id: `a_${Date.now().toString(36)}`, title: "", stat: "total_runs", target: 10, reward: { gems: 5 } })} />],
    ["daily_rewards", "Daily rewards (7 days)", <EditableTable key="d" testid="liveops-daily-table" rows={s.daily_rewards} columns={DAILY_COLS} onChange={set("daily_rewards")} readOnly={!editable} />],
    ["events", "Events", <EditableTable key="e" testid="liveops-events-table" rows={s.events} columns={EVENT_COLS} onChange={set("events")} readOnly={!editable} removable
      addRow={() => ({ event_id: `evt_${Date.now().toString(36)}`, name: "New event", world: "city", description: "", art: "world_city", rule: { type: "tokens", target: 50, token_label: "golden tokens" }, rewards: { coins: 1000 }, starts_at: new Date(now).toISOString(), ends_at: new Date(now + 7 * 864e5).toISOString(), enabled: true })} />],
  ];
  return (
    <div data-testid="admin-liveops">
      <PageHeader title="Live-ops" description={`Missions, achievements, daily rewards and events from published config v${data.version}. To disable a mission remove it; events have an Enabled switch.`} />
      <Tabs defaultValue="missions">
        <TabsList className="flex h-auto flex-wrap">{tabs.map(([k, l]) => <TabsTrigger key={k} value={k} data-testid={`liveops-tab-${k}`}>{l}</TabsTrigger>)}</TabsList>
        {tabs.map(([k, , el]) => <TabsContent key={k} value={k} className="mt-4">{el}</TabsContent>)}
      </Tabs>
      {editable ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-[260px] flex-1 space-y-1"><Label htmlFor="liveops-note" className="text-xs text-muted-foreground">Change note</Label><Input id="liveops-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Halloween event" data-testid="liveops-note-input" /></div>
          <Button onClick={save} disabled={busy} data-testid="liveops-save-draft-btn"><FilePlus2 className="mr-1 h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save all as draft"}</Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="liveops-readonly-note">Read-only — editing needs liveops:edit and config:edit.</p>
      )}
    </div>
  );
}
