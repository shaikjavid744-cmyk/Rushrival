import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Send, AlertTriangle } from "lucide-react";
import { Seo } from "@/lib/seo";
import { publicApi } from "@/lib/api";
import { PageHero, Section } from "@/components/site/States";

const CATEGORIES = [
  ["bug", "Bug or crash"],
  ["account", "Account & sign-in"],
  ["purchase", "Purchase or payment"],
  ["feedback", "Feedback & ideas"],
  ["other", "Something else"],
];
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const EMPTY = { name: "", email: "", category: "", message: "", website: "" };

export function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Enter your name";
  if (!EMAIL_RX.test(f.email.trim())) e.email = "Enter a valid email";
  if (!f.category) e.category = "Choose a category";
  if (f.message.trim().length < 10) e.message = "Message must be at least 10 characters";
  return e;
}

export function Field({ id, label, error, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-display text-lg">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted-rr">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-[#FF8A93]" role="alert" data-testid={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function useFormToken() {
  const tok = useRef(null);
  const load = useCallback(() => {
    tok.current = null;
    return publicApi.get("/contact/form-token").then((d) => (tok.current = d.form_token)).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { tok, load };
}

export default function Support() {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ state: "idle" });
  const { tok, load } = useFormToken();
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) return setStatus({ state: "idle" });
    setStatus({ state: "sending" });
    try {
      if (!tok.current) await load();
      const r = await publicApi.post("/contact", { ...f, name: f.name.trim(), email: f.email.trim(), form_token: tok.current || "" });
      setStatus({ state: "done", ticket: r.ticket_no, emailed: r.confirmation_email_sent });
      window.scrollTo({ top: 0, behavior: "smooth" });
      setF(EMPTY);
      load();
    } catch (err) {
      if (err.code === "validation_error" && err.details?.fields) {
        setErrors(err.details.fields);
        return setStatus({ state: "idle" });
      }
      if (err.code === "form_expired") load();
      const msg = ["spam_rejected", "form_expired", "rate_limited"].includes(err.code)
        ? err.code === "rate_limited" ? "You've sent a lot of messages. Please wait a while and try again." : err.message
        : "Something went wrong. Please try again.";
      setStatus({ state: "error", message: msg });
    }
  };

  return (
    <div data-testid="support-page">
      <Seo title="Support & Contact" path="/support" description="Contact Rush Rivals support. Report a bug, ask about your account or purchases, or send feedback — you'll get a ticket number." />
      <PageHero eyebrow="We're here to help" title="Support & contact">
        <p>Check the <Link to="/faq" className="text-[#4da3ff] underline">FAQ</Link> first — otherwise send us a message and you'll get a ticket number right away.</p>
      </PageHero>
      <Section className="max-w-3xl">
        {status.state === "done" ? (
          <div role="status" className="rr-card p-8 text-center" data-testid="contact-success">
            <CheckCircle2 className="mx-auto h-14 w-14 text-[#22D36B]" aria-hidden />
            <p className="mt-4 font-display text-3xl" data-testid="contact-success-message">Thanks! Your ticket number is {status.ticket}</p>
            <p className="mt-2 text-[#d7e0f4]">{status.emailed ? "We've emailed you a confirmation." : "Keep this number — we'll reply to the email you gave us."}</p>
            <button type="button" className="rr-btn rr-btn-navy mt-6" onClick={() => setStatus({ state: "idle" })} data-testid="contact-new-message-btn">Send another message</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="rr-card relative grid gap-6 p-6 sm:p-8" data-testid="contact-form" aria-describedby="contact-status">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="contact-name" label="Your name" error={errors.name}>
                <input id="contact-name" className="rr-input" value={f.name} onChange={set("name")} autoComplete="name" maxLength={80} aria-invalid={!!errors.name} aria-describedby={errors.name ? "contact-name-error" : undefined} data-testid="contact-name-input" />
              </Field>
              <Field id="contact-email" label="Email" error={errors.email}>
                <input id="contact-email" type="email" className="rr-input" value={f.email} onChange={set("email")} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "contact-email-error" : undefined} data-testid="contact-email-input" />
              </Field>
            </div>
            <Field id="contact-category" label="What's it about?" error={errors.category}>
              <select id="contact-category" className="rr-input" value={f.category} onChange={set("category")} aria-invalid={!!errors.category} data-testid="contact-category-select">
                <option value="">Choose a category</option>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field id="contact-message" label="Message" error={errors.message} hint="At least 10 characters. Include your device and what happened.">
              <textarea id="contact-message" rows={6} className="rr-input" value={f.message} onChange={set("message")} maxLength={4000} aria-invalid={!!errors.message} aria-describedby={errors.message ? "contact-message-error" : undefined} data-testid="contact-message-input" />
            </Field>
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="contact-website">Website (leave empty)</label>
              <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} data-testid="contact-honeypot-input" />
            </div>
            <div id="contact-status" aria-live="polite">
              {status.state === "error" && (
                <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#FF3B4A]/60 bg-[#FF3B4A]/10 px-4 py-3 text-[#FFB3B9]" data-testid="contact-error">
                  <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> {status.message}
                </p>
              )}
            </div>
            <button type="submit" className="rr-btn rr-btn-blue rr-btn-lg justify-self-start" disabled={status.state === "sending"} data-testid="contact-submit-btn">
              <Send className="h-5 w-5" aria-hidden /> {status.state === "sending" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </Section>
    </div>
  );
}
