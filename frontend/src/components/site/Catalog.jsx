import { publicApi, artUrl } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";

let cache = null;
export function useCatalog() {
  return useAsync(async () => {
    if (cache) return cache;
    const d = await publicApi.get("/catalog");
    cache = d;
    return d;
  }, []);
}

const UNLOCK_STYLE = {
  free: "bg-[#22D36B]/15 text-[#5CF29A] border-[#22D36B]/50",
  ad: "bg-[#00D4FF]/10 text-[#7FE8FF] border-[#00D4FF]/50",
  coins: "bg-[#FFC107]/15 text-[#FFD45C] border-[#FFC107]/50",
  gems: "bg-[#C77DFF]/15 text-[#DDB0FF] border-[#C77DFF]/50",
};

export function UnlockBadge({ unlock, testid }) {
  if (!unlock) return null;
  const key = unlock.type === "currency" ? unlock.currency : unlock.type;
  const label = unlock.type === "free" ? "Free — unlocked from the start" : unlock.type === "ad" ? unlock.label : `Unlock: ${unlock.label}`;
  return (
    <span className={`inline-flex self-start items-center rounded-full border px-3 py-1 text-sm ${UNLOCK_STYLE[key] || UNLOCK_STYLE.free}`} data-testid={testid}>
      {label}
    </span>
  );
}

export function CatalogCard({ item, kind, index = 0 }) {
  const wide = kind === "worlds";
  return (
    <li className="rr-card rr-rise group flex flex-col overflow-hidden" style={{ animationDelay: `${index * 70}ms` }} data-testid={`${kind}-card-${item.id}`}>
      <div className={`relative flex items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#2f4688,#16224A_70%)] ${wide ? "h-56" : "h-64"}`}>
        <img
          src={artUrl(item.art_url)}
          alt={`${item.name} ${kind === "powerups" ? "power-up icon" : kind.slice(0, -1) + " art"}`}
          loading="lazy"
          className={
            wide
              ? "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              : "max-h-[88%] w-auto max-w-[85%] object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105"
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2 className="font-display text-2xl" data-testid={`${kind}-name-${item.id}`}>{item.name}</h2>
        <p className="flex-1 text-[#d7e0f4]">{item.description}</p>
        {item.unlock && <UnlockBadge unlock={item.unlock} testid={`${kind}-unlock-${item.id}`} />}
      </div>
    </li>
  );
}
