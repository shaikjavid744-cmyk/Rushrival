import { Seo } from "@/lib/seo";
import { artUrl } from "@/lib/api";
import { useCatalog, CatalogCard } from "@/components/site/Catalog";
import { PageHero, Section, ServiceError, CardSkeleton, EmptyState, GameLink } from "@/components/site/States";

const PAGES = {
  characters: {
    title: "Characters",
    eyebrow: "Meet the rivals",
    description: "Meet the Rush Rivals crew — Rush, Zoe, Kai, Shadow, Nova and Leo — and how to unlock each runner in the game.",
    intro: "Six original runners, each with their own style. Rush is free from your first run; the others unlock with coins, gems or by watching ads.",
    art: "/api/static/game/hero_zoe.png",
  },
  worlds: {
    title: "Worlds",
    eyebrow: "Six places to run",
    description: "Explore the Rush Rivals worlds — City, Beach, Snow, Night City, Temple and Lava — and how to unlock each one.",
    intro: "From sunny boardwalks to lava fields, every world changes the look of your run. City is open from the start.",
  },
  boards: {
    title: "Hoverboards",
    eyebrow: "Ride in style",
    description: "Browse every Rush Rivals hoverboard — Default, Flame, Neon, Dragon, Ice and Galaxy — with unlock costs.",
    intro: "A hoverboard saves you from one crash per run. Pick a look you love — the Default board is free.",
    art: "/api/static/game/board_galaxy.png",
  },
  powerups: {
    title: "Power-ups",
    eyebrow: "Grab them on the track",
    description: "Every Rush Rivals power-up explained: Coin Magnet, Shield, Speed Boost, Score x2 and Hoverboard.",
    intro: "Power-ups appear along the track during a run. Grab them to pull in coins, shrug off a crash or double your score.",
    art: "/api/static/game/pu_magnet.png",
  },
};

export default function CatalogPage({ kind }) {
  const p = PAGES[kind];
  const { data, error, loading, reload } = useCatalog();
  const items = data?.[kind] || [];
  const path = kind === "powerups" ? "/power-ups" : `/${kind}`;
  return (
    <div data-testid={`${kind}-page`}>
      <Seo title={p.title} description={p.description} path={path} />
      <PageHero eyebrow={p.eyebrow} title={p.title} art={p.art ? artUrl(p.art) : null}>
        <p>{p.intro}</p>
      </PageHero>
      <Section>
        {loading && <CardSkeleton />}
        {error && <ServiceError error={error} onRetry={reload} />}
        {data && items.length === 0 && <EmptyState title="Nothing here yet" testid={`${kind}-empty`} />}
        {data && items.length > 0 && (
          <ul className={`grid gap-6 sm:grid-cols-2 ${kind === "powerups" ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-3"}`} data-testid={`${kind}-grid`}>
            {items.map((it, i) => (
              <CatalogCard key={it.id} item={it} kind={kind} index={i} />
            ))}
          </ul>
        )}
        <div className="mt-14 flex flex-wrap items-center gap-4">
          <GameLink to="/download" variant="gold" testid={`${kind}-download-cta`}>Get the game</GameLink>
          <GameLink to="/features" variant="navy" testid={`${kind}-features-cta`}>All features</GameLink>
        </div>
      </Section>
    </div>
  );
}
