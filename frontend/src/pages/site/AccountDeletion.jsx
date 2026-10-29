import { useState } from "react";
import { CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { Seo } from "@/lib/seo";
import { publicApi } from "@/lib/api";
import { PageHero, Section } from "@/components/site/States";
import { Field } from "@/pages/site/Support";

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

function DeletionForm() {
  const [f, setF] = useState({ email: "", confirm: false, note: "" });
  const [errors, setErrors] = useState({});
  const [st, setSt] = useState({ state: "idle" });
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!EMAIL_RX.test(f.email.trim())) v.email = "Enter a valid email";
    if (!f.confirm) v.confirm = "Please confirm you want your data deleted";
    setErrors(v);
    if (Object.keys(v).length) return;
    setSt({ state: "sending" });
    try {
      const r = await publicApi.post("/data-deletion", { ...f, email: f.email.trim() });
      setSt({ state: "done", id: r.request_id, message: r.message });
    } catch (err) {
      if (err.details?.fields) {
        setErrors(err.details.fields);
        return setSt({ state: "idle" });
      }
      setSt({ state: "error", message: err.code === "rate_limited" ? "Too many requests. Please try again later." : "Something went wrong. Please try again." });
    }
  };
  if (st.state === "done")
    return (
      <div role="status" className="rr-card p-8" data-testid="deletion-success">
        <CheckCircle2 className="h-12 w-12 text-[#22D36B]" aria-hidden />
        <p className="mt-3 font-display text-2xl">Request received</p>
        <p className="mt-2 text-[#d7e0f4]">{st.message}</p>
        <p className="mt-3 text-sm text-muted-rr" data-testid="deletion-request-id">Reference: {st.id}</p>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="rr-card grid gap-5 p-6 sm:p-8" data-testid="deletion-form">
      <h2 className="font-display text-2xl">Request deletion on the web</h2>
      <Field id="deletion-email" label="Account email" error={errors.email}>
        <input id="deletion-email" type="email" className="rr-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" aria-invalid={!!errors.email} data-testid="deletion-email-input" />
      </Field>
      <Field id="deletion-note" label="Anything we should know? (optional)">
        <textarea id="deletion-note" rows={3} maxLength={500} className="rr-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="deletion-note-input" />
      </Field>
      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[#E1E7F5]">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1F8BFF]" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} aria-invalid={!!errors.confirm} data-testid="deletion-confirm-checkbox" />
          I understand this permanently deletes my Rush Rivals account, progress, coins, gems and purchases history.
        </label>
        {errors.confirm && <p className="mt-2 text-sm text-[#FF8A93]" role="alert" data-testid="deletion-confirm-error">{errors.confirm}</p>}
      </div>
      {st.state === "error" && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#FF3B4A]/60 bg-[#FF3B4A]/10 px-4 py-3 text-[#FFB3B9]" data-testid="deletion-error">
          <AlertTriangle className="h-5 w-5" aria-hidden /> {st.message}
        </p>
      )}
      <button type="submit" className="rr-btn rr-btn-blue justify-self-start" disabled={st.state === "sending"} data-testid="deletion-submit-btn">
        {st.state === "sending" ? "Sending…" : "Request deletion"}
      </button>
    </form>
  );
}

export default function AccountDeletion() {
  return (
    <div data-testid="account-deletion-page">
      <Seo title="Account & Data Deletion" path="/account-deletion" description="How to delete your Rush Rivals account and data — in the app or with a web request." />
      <PageHero eyebrow="Your data, your choice" title="Account & data deletion" />
      <Section className="grid max-w-6xl gap-10 lg:grid-cols-2">
        <div className="prose-rr">
          <h2 className="!mt-0 flex items-center gap-2"><Smartphone className="h-6 w-6 text-[#4da3ff]" aria-hidden /> Delete in the app (instant)</h2>
          <p>Open Rush Rivals → Account → Delete account, then type DELETE to confirm. Your account, cloud progress, wallet, ledger, runs and leaderboard scores are deleted immediately. Support tickets are kept without your personal details.</p>
          <h2>Playing as a guest?</h2>
          <p>Guest progress lives only on your device. Use Settings → Reset progress, or uninstall the game, to remove it.</p>
          <h2>Delete from the web</h2>
          <p>Can't open the app? Send a request with the email address on your account. We'll email you to confirm it's really you before deleting anything, and finish within 30 days.</p>
        </div>
        <DeletionForm />
      </Section>
    </div>
  );
}
