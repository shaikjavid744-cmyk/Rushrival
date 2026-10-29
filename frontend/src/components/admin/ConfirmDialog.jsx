import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Confirmation dialog for destructive / privileged actions.
 * - `reason`: require a reason (min 5 chars) passed to onConfirm(reason)
 * - `typed`: require typing this word to enable the confirm button
 * onConfirm may throw an ApiError; its message is shown inline and the dialog stays open.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive = true, reason = false, reasonLabel = "Reason", typed, onConfirm, children, testid = "confirm-dialog" }) {
  const [text, setText] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setText("");
      setWord("");
      setErr(null);
      setBusy(false);
    }
  }, [open]);
  const ok = (!reason || text.trim().length >= 5) && (!typed || word.trim() === typed);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(text.trim());
      onOpenChange(false);
    } catch (e) {
      setErr(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="border-2 bg-card text-white sm:max-w-lg" data-testid={testid}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {destructive && <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden />} {title}
          </DialogTitle>
          {description && <DialogDescription className="text-slate-300">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {reason && (
          <div className="space-y-2">
            <Label htmlFor={`${testid}-reason`}>{reasonLabel} (required, 5+ characters)</Label>
            <Textarea id={`${testid}-reason`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={300} data-testid={`${testid}-reason-input`} />
          </div>
        )}
        {typed && (
          <div className="space-y-2">
            <Label htmlFor={`${testid}-typed`}>Type <strong className="text-amber-300">{typed}</strong> to confirm</Label>
            <Input id={`${testid}-typed`} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" data-testid={`${testid}-typed-input`} />
          </div>
        )}
        {err && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-red-200" data-testid={`${testid}-error`}>{err}</p>}
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy} data-testid={`${testid}-cancel-btn`}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={go} disabled={!ok || busy} data-testid={`${testid}-confirm-btn`}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper: controlled confirm state. const c = useConfirm(); c.ask({...}); <ConfirmDialog {...c.props}/> */
export function useConfirm() {
  const [cfg, setCfg] = useState(null);
  return {
    ask: (c) => setCfg(c),
    props: { ...(cfg || {}), open: !!cfg, onOpenChange: (o) => !o && setCfg(null), onConfirm: cfg?.onConfirm || (() => {}) },
  };
}
