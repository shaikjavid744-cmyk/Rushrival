import { Link } from "react-router-dom";
import { useConsent } from "@/lib/consent";

const COLS = [
  ["Game", [["/features", "Features"], ["/characters", "Characters"], ["/worlds", "Worlds"], ["/boards", "Boards"], ["/power-ups", "Power-ups"], ["/download", "Download"]]],
  ["Community", [["/news", "News"], ["/faq", "FAQ"], ["/support", "Support & contact"], ["/account-deletion", "Account & data deletion"]]],
  ["Legal", [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"], ["/cookies", "Cookie & Consent"]]],
];

export default function Footer() {
  const { reopen } = useConsent();
  return (
    <footer className="border-t border-white/10 bg-[#070D20]" data-testid="site-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-3">
            <img src="/brand/velactra.png" alt="Velactra Game Studio logo" className="h-14 w-14 object-contain" width="56" height="56" loading="lazy" />
            <div>
              <p className="font-display text-xl">Velactra Game Studio</p>
              <p className="text-sm text-muted-rr">Makers of Rush Rivals</p>
            </div>
          </div>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-rr">
            An arcade endless runner for Android. Run, dodge, collect and compete — built by a small independent studio.
          </p>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="font-display text-lg text-[#FFC107]">{title}</h2>
            <ul className="mt-3 space-y-1">
              {links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="inline-block rounded py-1.5 text-[15px] text-[#d7e0f4] hover:text-white hover:underline" data-testid={`footer-link-${to.slice(1)}`}>
                    {label}
                  </Link>
                </li>
              ))}
              {title === "Legal" && (
                <li>
                  <button type="button" onClick={reopen} className="py-1.5 text-left text-[15px] text-[#d7e0f4] hover:text-white hover:underline" data-testid="footer-cookie-settings">
                    Cookie settings
                  </button>
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-sm text-muted-rr sm:px-6" data-testid="footer-copyright">
          © {new Date().getFullYear()} Velactra Game Studio. Rush Rivals and its characters are original works of Velactra Game Studio.
        </p>
      </div>
    </footer>
  );
}
