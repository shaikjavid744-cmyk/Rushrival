import { Link } from "react-router-dom";
import { CloudOff, RotateCw, Inbox } from "lucide-react";

export function ServiceError({ onRetry, error, testid = "service-error" }) {
  return (
    <div role="alert" className="rr-card mx-auto flex max-w-xl flex-col items-center px-6 py-10 text-center" data-testid={testid}>
      <CloudOff className="h-14 w-14 text-[#FF9100]" aria-hidden />
      <h2 className="mt-4 font-display text-2xl">We can't reach the game servers</h2>
      <p className="mt-2 text-[#d7e0f4]">{error?.status >= 500 || error?.status === 0 ? "The service is temporarily unavailable." : error?.message || "Something went wrong."} Please try again in a moment.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rr-btn rr-btn-blue mt-6" data-testid={`${testid}-retry-btn`}>
          <RotateCw className="h-5 w-5" aria-hidden /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, testid = "empty-state" }) {
  return (
    <div className="rr-card mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center" data-testid={testid}>
      <Inbox className="h-12 w-12 text-[#4da3ff]" aria-hidden />
      <p className="mt-4 font-display text-2xl">{title}</p>
      {children && <div className="mt-2 text-[#d7e0f4]">{children}</div>}
    </div>
  );
}

export function CardSkeleton({ count = 6 }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading" data-testid="loading-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-3xl bg-[#16224A]" />
      ))}
    </div>
  );
}

export function PageHero({ eyebrow, title, children, art }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#0D1633]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(31,139,255,0.28),transparent_60%)]" aria-hidden />
      <div className="relative mx-auto flex max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl rr-rise">
          {eyebrow && <p className="font-display text-lg uppercase tracking-wide text-[#FFC107]">{eyebrow}</p>}
          <h1 className="mt-1 font-display text-4xl leading-tight text-outline sm:text-5xl lg:text-6xl" data-testid="page-title">
            {title}
          </h1>
          {children && <div className="mt-4 text-lg leading-relaxed text-[#d7e0f4]">{children}</div>}
        </div>
        {art && <img src={art} alt="" aria-hidden className="ml-auto hidden h-56 w-auto drop-shadow-2xl rr-float lg:block" />}
      </div>
    </section>
  );
}

export function Section({ children, className = "" }) {
  return <section className={`mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20 ${className}`}>{children}</section>;
}

export function GameLink({ to, variant = "blue", children, testid, className = "" }) {
  return (
    <Link to={to} className={`rr-btn rr-btn-${variant} ${className}`} data-testid={testid}>
      {children}
    </Link>
  );
}
