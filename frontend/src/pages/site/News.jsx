import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Seo } from "@/lib/seo";
import { publicApi, artUrl } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHero, Section, ServiceError, EmptyState } from "@/components/site/States";
import NotFound from "@/pages/site/NotFound";

export const fmtDate = (d) => (d ? new Date(d.endsWith?.("Z") || d.includes?.("+") ? d : `${d}Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");

/** Plain-text body → paragraphs (blank line separated). No HTML is injected. */
export function ArticleBody({ body }) {
  return (
    <div className="prose-rr">
      {(body || "").split(/\n\s*\n/).map((para, i) =>
        para.startsWith("## ") ? <h2 key={i}>{para.slice(3)}</h2> : <p key={i} className="whitespace-pre-line">{para}</p>
      )}
    </div>
  );
}

export function NewsList() {
  const [cursor, setCursor] = useState(null);
  const [pages, setPages] = useState([]);
  const { data, error, loading, reload } = useAsync(() => publicApi.get(`/news?limit=9${cursor ? `&cursor=${cursor}` : ""}`), [cursor]);
  const items = [...pages, ...(data?.items || [])];
  const more = () => {
    setPages(items);
    setCursor(data.next_cursor);
  };
  return (
    <div data-testid="news-page">
      <Seo title="News" path="/news" description="The latest Rush Rivals news and updates from Velactra Game Studio." />
      <PageHero eyebrow="From the studio" title="News">
        <p>Updates, events and patch notes — posted by the Rush Rivals team.</p>
      </PageHero>
      <Section>
        {error && <ServiceError error={error} onRetry={reload} />}
        {!error && data && items.length === 0 && <EmptyState title={data.empty_message || "No news yet — check back soon"} testid="news-empty" />}
        {items.length > 0 && (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="news-list">
            {items.map((n) => (
              <li key={n.slug} className="rr-card group overflow-hidden" data-testid={`news-item-${n.slug}`}>
                <Link to={`/news/${n.slug}`} className="flex h-full flex-col rounded-3xl" data-testid={`news-link-${n.slug}`}>
                  <img src={n.image_url ? artUrl(n.image_url) : artUrl("/api/static/game/city_bg.jpg")} alt="" aria-hidden className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <p className="flex items-center gap-1 text-sm text-muted-rr"><CalendarDays className="h-4 w-4" aria-hidden /> {fmtDate(n.published_at)}</p>
                    <h2 className="font-display text-2xl group-hover:text-[#FFC107]">{n.title}</h2>
                    <p className="text-[#d7e0f4]">{n.summary}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {loading && <div className="mt-6 h-24 animate-pulse rounded-3xl bg-[#16224A]" aria-busy="true" data-testid="news-loading" />}
        {data?.next_cursor && !loading && (
          <button type="button" className="rr-btn rr-btn-navy mt-10" onClick={more} data-testid="news-load-more-btn">
            Older news
          </button>
        )}
      </Section>
    </div>
  );
}

export function Article() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync(() => publicApi.get(`/news/${encodeURIComponent(slug)}`), [slug]);
  if (error?.status === 404) return <NotFound />;
  return (
    <article data-testid="article-page">
      <Seo title={data?.title || "News"} description={data?.summary || "Rush Rivals news"} path={`/news/${slug}`} />
      <Section className="max-w-3xl">
        <Link to="/news" className="inline-flex items-center gap-1 rounded-lg py-2 text-[#4da3ff] hover:text-white" data-testid="article-back-link">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All news
        </Link>
        {loading && <div className="mt-6 h-96 animate-pulse rounded-3xl bg-[#16224A]" aria-busy="true" />}
        {error && <div className="mt-6"><ServiceError error={error} onRetry={reload} /></div>}
        {data && (
          <>
            <p className="mt-6 text-muted-rr">{fmtDate(data.published_at)}</p>
            <h1 className="mt-1 font-display text-4xl text-outline sm:text-5xl" data-testid="article-title">{data.title}</h1>
            <p className="mt-4 text-xl text-[#E1E7F5]">{data.summary}</p>
            {data.image_url && <img src={artUrl(data.image_url)} alt="" className="mt-8 w-full rounded-3xl" />}
            <div className="mt-8" data-testid="article-body"><ArticleBody body={data.body} /></div>
          </>
        )}
      </Section>
    </article>
  );
}

