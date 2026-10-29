import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Seo } from "@/lib/seo";
import { artUrl } from "@/lib/api";

export default function NotFound() {
  return (
    <div className="relative isolate overflow-hidden" data-testid="not-found-page">
      <Seo title="Page not found" description="This page doesn't exist. Head back to the Rush Rivals home page." noindex />
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 py-20 text-center md:flex-row md:text-left">
        <img src={artUrl("/api/static/game/hero_shadow.png")} alt="Shadow, a hooded runner, looking lost" className="h-72 w-auto drop-shadow-2xl rr-float" />
        <div>
          <p className="font-display text-7xl text-gold-grad sm:text-8xl" aria-hidden>404</p>
          <h1 className="mt-2 font-display text-4xl text-outline">You ran off the track!</h1>
          <p className="mt-3 max-w-md text-lg text-[#d7e0f4]">The page you're looking for doesn't exist or has moved.</p>
          <Link to="/" className="rr-btn rr-btn-gold rr-btn-lg mt-8" data-testid="not-found-home-link">
            <Home className="h-6 w-6" aria-hidden /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
