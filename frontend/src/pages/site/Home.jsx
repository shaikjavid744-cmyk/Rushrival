import { Link } from "react-router-dom";
import { Download, Sparkles, ArrowRight, MoveHorizontal, ShieldCheck, Coins, Trophy } from "lucide-react";
import { Seo } from "@/lib/seo";
import { artUrl } from "@/lib/api";
import { useCatalog, CatalogCard } from "@/components/site/Catalog";
import { Section, ServiceError, CardSkeleton, GameLink } from "@/components/site/States";
import { PhoneShot } from "@/components/site/PhoneShot";

const SHOTS = [
  ["menu", "Main menu with Rush, the PLAY button and the coin and gem balance"],
  ["jump", "Jumping over a barrier while collecting a trail of coins"],
  ["run-roof", "Running across the train roofs in the City"],
  ["slide", "Sliding under a high barrier"],
  ["game-over", "Game over summary with score, distance and coins"],
];

const LOOP = [
  [MoveHorizontal, "Run", "Three lanes, rising speed. Swipe left and right to switch lanes."],
  [ShieldCheck, "Dodge", "Jump barriers, slide under gates and hop onto train roofs."],
  [Coins, "Collect", "Grab gold coins and power-ups to unlock runners, boards and worlds."],
  [Trophy, "Compete", "Beat your best and climb the daily, weekly and all-time boards."],
];

function Hero() {
  return (
    <section className="relative isolate overflow-hidden" data-testid="home-hero">
      <img src={artUrl("/api/static/game/city_bg.jpg")} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full object-cover object-top opacity-60" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0A1128]/40 via-[#0A1128]/70 to-[#0A1128]" aria-hidden />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-16">
        <div className="rr-rise text-center lg:text-left">
          <h1 className="sr-only">Rush Rivals — an arcade endless runner by Velactra Game Studio</h1>
          <img src={artUrl("/api/static/game/logo.png")} alt="Rush Rivals logo" className="mx-auto h-auto w-[min(88vw,460px)] drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)] lg:mx-0" width="460" height="303" data-testid="home-logo" />
          <p className="mt-4 font-display text-2xl text-[#FFC107] text-outline sm:text-4xl" data-testid="home-tagline">
            Run · Dodge · Collect · Compete
          </p>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[#E1E7F5] lg:mx-0">
            A fast, juicy 3-lane endless runner. Swipe to dodge trains and barriers, collect gold coins, unlock new rivals and keep beating your best score — even offline.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <GameLink to="/download" variant="gold" className="rr-btn-lg w-full sm:w-auto" testid="home-download-cta">
              <Download className="h-6 w-6" aria-hidden /> Download
            </GameLink>
            <GameLink to="/features" variant="blue" className="rr-btn-lg w-full sm:w-auto" testid="home-features-cta">
              <Sparkles className="h-6 w-6" aria-hidden /> Features
            </GameLink>
          </div>
        </div>
        <div className="relative mx-auto flex h-[420px] w-full max-w-md items-end justify-center sm:h-[520px]">
          <div className="absolute bottom-0 left-1/2 h-24 w-72 -translate-x-1/2 rounded-full bg-[#1F8BFF]/40 blur-3xl" aria-hidden />
          <div className="absolute right-0 top-4 hidden w-44 rotate-6 sm:block">
            <PhoneShot name="jump" alt="Gameplay: jumping a barrier while collecting coins" eager />
          </div>
          <img src={artUrl("/api/static/game/hero_rush.png")} alt="Rush, the red-hoodie runner" className="rr-float relative h-[400px] w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)] sm:h-[500px]" width="206" height="512" data-testid="home-hero-art" />
        </div>
      </div>
    </section>
  );
}

function Screens() {
  return (
    <Section>
      <p className="font-display text-lg uppercase text-[#FFC107]">Straight from the game</p>
      <h2 className="mt-1 font-display text-3xl text-outline sm:text-5xl">Real gameplay screenshots</h2>
      <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0" data-testid="home-screenshots">
        {SHOTS.map(([n, alt], i) => (
          <li key={n} className={`w-[62vw] max-w-[240px] shrink-0 snap-center lg:w-auto lg:max-w-none ${i % 2 ? "lg:translate-y-8" : ""}`}>
            <PhoneShot name={n} alt={alt} />
            <p className="mt-3 text-center text-sm text-muted-rr">{alt}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Loop() {
  return (
    <section className="border-y border-white/10 bg-[#0D1633]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {LOOP.map(([Icon, t, d], i) => (
          <div key={t} className="rr-rise" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1F8BFF] shadow-[0_5px_0_#0D52C2]">
              <Icon className="h-7 w-7" aria-hidden />
            </div>
            <h3 className="mt-4 font-display text-2xl">{t}</h3>
            <p className="mt-1 text-[#d7e0f4]">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Teaser({ kind, title, to, limit }) {
  const { data, error, loading, reload } = useCatalog();
  return (
    <Section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-3xl text-outline sm:text-5xl">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-[#4da3ff] hover:text-white" data-testid={`home-${kind}-link`}>
          See all {title.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="mt-8">
        {loading && <CardSkeleton count={3} />}
        {error && <ServiceError error={error} onRetry={reload} testid={`home-${kind}-error`} />}
        {data && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data[kind].slice(0, limit).map((it, i) => (
              <CatalogCard key={it.id} item={it} kind={kind} index={i} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

export default function Home() {
  return (
    <div data-testid="home-page">
      <Seo path="/" description="Rush Rivals is an arcade 3-lane endless runner for Android by Velactra Game Studio. Run, dodge, collect coins and compete on the leaderboards." />
      <Hero />
      <Loop />
      <Screens />
      <Teaser kind="characters" title="Characters" to="/characters" limit={3} />
      <Teaser kind="worlds" title="Worlds" to="/worlds" limit={3} />
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-[#1F8BFF] bg-[#16224A] p-8 sm:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_30%,rgba(255,193,7,0.22),transparent_55%)]" aria-hidden />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl">Ready to run?</h2>
              <p className="mt-2 max-w-lg text-[#d7e0f4]">Rush Rivals is coming to Android. Check the download page for the latest availability.</p>
            </div>
            <GameLink to="/download" variant="gold" className="rr-btn-lg" testid="home-bottom-download-cta">
              <Download className="h-6 w-6" aria-hidden /> Download
            </GameLink>
          </div>
        </div>
      </section>
    </div>
  );
}
