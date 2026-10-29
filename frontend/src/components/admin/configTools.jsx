import { Plus, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/** Copy the published config, apply `mutate(data)`, and save it as a new DRAFT (never live until approved + published). */
export async function draftFrom(mutate, note) {
  const pub = await adminApi.get("/config/published");
  const data = JSON.parse(JSON.stringify(pub.data));
  mutate(data);
  return adminApi.post("/config/drafts", { data, note });
}

export const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
export function setPath(o, p, v) {
  const out = JSON.parse(JSON.stringify(o));
  const ks = p.split(".");
  let cur = out;
  ks.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  });
  if (v === undefined) delete cur[ks.at(-1)];
  else cur[ks.at(-1)] = v;
  return out;
}

const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Cell({ col, row, onChange, id, readOnly }) {
  const v = getPath(row, col.key);
  const cls = "h-9 w-full min-w-[80px] rounded-md border bg-background px-2 text-sm disabled:opacity-60";
  if (col.render) return col.render(row);
  if (col.type === "bool") return <Switch checked={v !== false} onCheckedChange={(c) => onChange(c)} disabled={readOnly} aria-label={col.label} data-testid={`${id}-switch`} />;
  if (col.type === "select")
    return (
      <select className={cls} value={v ?? ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly} aria-label={col.label} data-testid={`${id}-select`}>
        {col.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
      </select>
    );
  if (col.type === "number")
    return <input type="number" min="0" className={cls} value={v ?? ""} disabled={readOnly || col.disabled?.(row)} onChange={(e) => onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))} aria-label={col.label} data-testid={`${id}-input`} />;
  if (col.type === "datetime")
    return <input type="datetime-local" className={cls} value={toLocal(v)} disabled={readOnly} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")} aria-label={col.label} data-testid={`${id}-input`} />;
  return <input type="text" className={cls} value={v ?? ""} disabled={readOnly || (col.lockExisting && row.__existing)} onChange={(e) => onChange(e.target.value)} aria-label={col.label} data-testid={`${id}-input`} />;
}

/** Inline-editable table of config rows. */
export function EditableTable({ rows, columns, onChange, testid, readOnly, addRow, removable, rowKey = (r, i) => i }) {
  const update = (i, key, v) => onChange(rows.map((r, j) => (j === i ? setPath(r, key, v) : r)));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid={testid}>
          <thead className="bg-white/5 text-left text-xs uppercase text-muted-foreground">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-bold">{c.label}</th>)}{removable && !readOnly && <th className="w-12"><span className="sr-only">Remove</span></th>}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} data-testid={`${testid}-row-${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 align-middle ${c.wide ? "min-w-[220px]" : ""}`}>
                    <Cell col={c} row={r} id={`${testid}-${i}-${c.key.replace(/\./g, "-")}`} readOnly={readOnly} onChange={(v) => (c.onSet ? onChange(rows.map((x, j) => (j === i ? c.onSet(x, v) : x))) : update(i, c.key, v))} />
                  </td>
                ))}
                {removable && !readOnly && (
                  <td className="px-2"><Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))} data-testid={`${testid}-remove-${i}`}><Trash2 className="h-4 w-4" /></Button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {addRow && !readOnly && <Button size="sm" variant="secondary" onClick={() => onChange([...rows, addRow()])} data-testid={`${testid}-add-btn`}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add</Button>}
    </div>
  );
}
