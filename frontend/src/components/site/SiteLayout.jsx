import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, Download } from "lucide-react";
import { artUrl } from "@/lib/api";
import Footer from "@/components/site/Footer";
import CookieBanner from "@/components/site/CookieBanner";

export const NAV = [
  ["/features", "Features"],
  ["/characters", "Characters"],
  ["/worlds", "Worlds"],
  ["/boards", "Boards"],
  ["/power-ups", "Power-ups"],
  ["/news", "News"],
  ["/faq", "FAQ"],
  ["/support", "Support"],
];

const linkCls = ({ isActive }) =>
  `rounded-xl px-3 py-2 text-[15px] transition-colors hover:bg-white/10 hover:text-white ${isActive ? "text-[#FFC107]" : "text-[#d7e0f4]"}`;

function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A1128]/85 backdrop-blur-md" data-testid="site-header">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20">
        <Link to="/" className="flex shrink-0 items-center rounded-xl" data-testid="site-logo-link" aria-label="Rush Rivals home">
          <img src={artUrl("/api/static/game/logo.png")} alt="Rush Rivals" className="h-11 w-auto lg:h-14" width="84" height="56" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={linkCls} data-testid={`nav-${to.slice(1)}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/download" className="rr-btn rr-btn-gold hidden !min-h-[44px] !px-5 !text-base sm:inline-flex" data-testid="header-download-btn">
            <Download className="h-5 w-5" aria-hidden /> Download
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            data-testid="mobile-menu-toggle"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-white/10 bg-[#0A1128] px-4 pb-6 pt-3 xl:hidden" data-testid="mobile-nav">
          <ul className="grid grid-cols-2 gap-2">
            {[...NAV, ["/download", "Download"]].map(([to, label]) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => `${linkCls({ isActive })} block bg-white/5 py-3`} data-testid={`mobile-nav-${to.slice(1)}`}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

export default function SiteLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-navy text-white" data-testid="site-layout">
      <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-50 rounded-xl bg-[#FFC107] px-4 py-2 text-[#3A1C00]" data-testid="skip-to-content">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
