import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { adminApi, qs } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader, usePaged, ListState, StatusBadge, fmtTime, fmtNum, Loading, ErrorBlock, Empty } from "@/components/admin/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function Deletions() {
  const { data, error, loading, reload } = useAsync(() => adminApi.get("/deletion-requests"), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBlock error={error} onRetry={reload} />;
  if (!data.items.length) return <Empty testid="deletions-empty">No web deletion requests.</Empty>;
  return (
    <Table data-testid="deletions-table">
      <TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Email</TableHead><TableHead>Note</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
      <TableBody>
        {data.items.map((r) => (
          <TableRow key={r.request_id} data-testid={`deletion-row-${r.request_id}`}>
            <TableCell className="font-mono text-xs">{r.request_id}</TableCell><TableCell>{r.email}</TableCell><TableCell className="max-w-xs truncate">{r.note || "—"}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell><TableCell>{fmtTime(r.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Players() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [text, setText] = useState(q);
  const paged = usePaged((c) => `/players${qs({ q, limit: 20, cursor: c })}`, [q]);
  return (
    <div data-testid="admin-players">
      <PageHeader title="Players" description="Find a player by email, name or player id." />
      <Tabs defaultValue="search">
        <TabsList><TabsTrigger value="search" data-testid="players-tab-search">Search</TabsTrigger><TabsTrigger value="deletions" data-testid="players-tab-deletions">Deletion requests</TabsTrigger></TabsList>
        <TabsContent value="search" className="mt-4 space-y-4">
          <form className="flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); setParams(text.trim() ? { q: text.trim() } : {}); }} role="search">
            <label htmlFor="player-search" className="sr-only">Search players</label>
            <Input id="player-search" placeholder="Email, name or usr_…" value={text} onChange={(e) => setText(e.target.value)} data-testid="player-search-input" />
            <Button type="submit" data-testid="player-search-btn"><Search className="mr-1 h-4 w-4" aria-hidden /> Search</Button>
          </form>
          <ListState paged={paged} empty={q ? `No players match “${q}”.` : "No players yet."}>
            <div className="rounded-xl border">
              <Table data-testid="players-table">
                <TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Coins</TableHead><TableHead className="text-right">Gems</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paged.items.map((u) => (
                    <TableRow key={u.user_id} data-testid={`player-row-${u.user_id}`}>
                      <TableCell><Link to={`/admin/players/${u.user_id}`} className="font-bold text-[#4da3ff] hover:underline" data-testid={`player-link-${u.user_id}`}>{u.name || "(no name)"}</Link><div className="font-mono text-[11px] text-muted-foreground">{u.user_id}</div></TableCell>
                      <TableCell>{u.email || "—"}</TableCell>
                      <TableCell className="text-right">{fmtNum(u.wallet?.coins)}</TableCell><TableCell className="text-right">{fmtNum(u.wallet?.gems)}</TableCell>
                      <TableCell><StatusBadge status={u.banned ? "banned" : "active"} /></TableCell>
                      <TableCell>{fmtTime(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ListState>
        </TabsContent>
        <TabsContent value="deletions" className="mt-4"><Deletions /></TabsContent>
      </Tabs>
    </div>
  );
}
