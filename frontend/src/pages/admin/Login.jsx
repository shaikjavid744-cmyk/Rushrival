import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, Lock, ShieldCheck, Copy } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAdmin } from "@/lib/adminAuth";
import { useSeo } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/admin/AdminLayout";

function errText(e) {
  if (e.code === "account_locked") return "Too many failed attempts. This account is locked for 15 minutes — try again later.";
  if (e.code === "rate_limited") return `Too many attempts. Wait ${e.details?.retry_after_s || 60} seconds and try again.`;
  if (e.code === "mfa_token_invalid") return "Your sign-in step expired. Start again.";
  if (e.code === "validation_error") return "Enter the 6-digit code from your authenticator app.";
  return e.message || "Sign-in failed. Try again.";
}

function Shell({ title, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-white" data-testid="admin-login-page">
      <div className="w-full max-w-md rounded-2xl border-2 bg-card p-6 shadow-2xl sm:p-8">
        <Brand />
        <h1 className="mt-6 text-2xl font-extrabold" data-testid="admin-login-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function ErrorMsg({ error }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-red-200" data-testid="admin-login-error">
      {error.code === "account_locked" && <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />} {errText(error)}
    </p>
  );
}

function CodeForm({ mfa, onDone, onRestart, children }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await adminApi.post("/auth/totp/verify", { mfa_token: mfa, code: code.trim() }));
    } catch (err) {
      setError(err);
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-5 space-y-4" data-testid="admin-totp-form">
      {children}
      <div className="space-y-2">
        <Label htmlFor="totp-code">6-digit code</Label>
        <Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus className="h-12 text-center text-2xl tracking-[0.5em]" data-testid="admin-totp-input" />
      </div>
      <ErrorMsg error={error} />
      <Button type="submit" className="h-11 w-full" disabled={busy || code.length !== 6} data-testid="admin-totp-submit-btn">{busy ? "Verifying…" : "Verify"}</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onRestart} data-testid="admin-login-restart-btn">Use a different account</Button>
    </form>
  );
}

function Enroll({ mfa, onDone, onRestart }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(null);
  useEffect(() => {
    if (started.current === mfa) return; // enrol once per sign-in (StrictMode double-effects would rotate the secret)
    started.current = mfa;
    adminApi.post("/auth/totp/enroll", { mfa_token: mfa }).then(setData).catch(setError);
  }, [mfa]);
  return (
    <Shell title="Set up two-factor sign-in">
      <p className="mt-2 text-sm text-muted-foreground">Two-factor authentication is required. Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the code it shows.</p>
      {error && <div className="mt-4"><ErrorMsg error={error} /><Button className="mt-3" variant="secondary" onClick={onRestart}>Start again</Button></div>}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground" role="status">Generating your secret…</p>}
      {data && (
        <CodeForm mfa={mfa} onDone={onDone} onRestart={onRestart}>
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4" data-testid="admin-totp-qr">
            <QRCodeSVG value={data.otpauth_uri} size={184} aria-label="QR code for your authenticator app" />
          </div>
          <div className="rounded-lg border bg-[#070D20] p-3">
            <p className="text-xs text-muted-foreground">Can't scan? Enter this secret manually. It's shown only once.</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="break-all text-sm font-bold text-amber-300" data-testid="admin-totp-secret">{data.secret}</code>
              <Button type="button" size="icon" variant="ghost" aria-label="Copy secret" onClick={() => navigator.clipboard?.writeText(data.secret)} data-testid="admin-totp-copy-btn"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </CodeForm>
      )}
    </Shell>
  );
}

export default function AdminLogin() {
  const { status, setSession } = useAdmin();
  const loc = useLocation();
  const nav = useNavigate();
  const [step, setStep] = useState({ name: "password" });
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useSeo({ title: "Admin sign in", description: "Rush Rivals admin", noindex: true });

  if (status === "authed" && step.name === "password") return <Navigate to={loc.state?.from || "/admin"} replace />;

  const done = (r) => {
    setSession(r.admin, r.csrf_token);
    nav(loc.state?.from && loc.state.from !== "/admin/login" ? loc.state.from : "/admin", { replace: true });
  };
  const restart = () => {
    setStep({ name: "password" });
    setError(null);
  };
  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.post("/auth/login", { email: f.email.trim(), password: f.password });
      setF((s) => ({ ...s, password: "" }));
      setStep({ name: r.mfa_enrolled ? "challenge" : "enroll", mfa: r.mfa_token });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (step.name === "enroll") return <Enroll mfa={step.mfa} onDone={done} onRestart={restart} />;
  if (step.name === "challenge")
    return (
      <Shell title="Two-factor verification">
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" aria-hidden /> Enter the current code from your authenticator app.</p>
        <CodeForm mfa={step.mfa} onDone={done} onRestart={restart} />
      </Shell>
    );
  return (
    <Shell title="Sign in to the admin panel">
      {loc.state?.reason && <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200" role="status" data-testid="admin-login-reason">{loc.state.reason}</p>}
      <form onSubmit={login} className="mt-5 space-y-4" data-testid="admin-login-form">
        <div className="space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input id="admin-email" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="h-11" data-testid="admin-email-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input id="admin-password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="h-11" data-testid="admin-password-input" />
        </div>
        <ErrorMsg error={error} />
        <Button type="submit" className="h-11 w-full" disabled={busy} data-testid="admin-login-submit-btn">{busy ? "Signing in…" : "Continue"}</Button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden /> Staff only. Player accounts can't sign in here.</p>
      </form>
    </Shell>
  );
}
