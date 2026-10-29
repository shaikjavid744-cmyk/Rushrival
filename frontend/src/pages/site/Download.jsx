import { Link } from "react-router-dom";
import { Play, Clock, Smartphone } from "lucide-react";
import { Seo } from "@/lib/seo";
import { publicApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHero, Section, ServiceError } from "@/components/site/States";
import { PhoneShot } from "@/components/site/PhoneShot";

export default function DownloadPage() {
  const { data, error, loading, reload } = useAsync(() => publicApi.get("/site-config"), []);
  return (
    <div data-testid="download-page">
      <Seo title="Download" path="/download" description="Get Rush Rivals for Android. See current availability on Google Play." />
      <PageHero eyebrow="Android" title="Download Rush Rivals">
        <p>Rush Rivals is built for Android phones (portrait). Here's where you can get it.</p>
      </PageHero>
      <Section className="grid items-start gap-12 lg:grid-cols-[1fr_300px]">
        <div>
          {loading && <div className="h-48 animate-pulse rounded-3xl bg-[#16224A]" aria-busy="true" data-testid="download-loading" />}
          {error && <ServiceError error={error} onRetry={reload} />}
          {data && data.store_url_android && (
            <div className="rr-card p-8" data-testid="download-available">
              <h2 className="font-display text-3xl">Available on Google Play</h2>
              <p className="mt-2 text-[#d7e0f4]">Install Rush Rivals from the official Google Play listing.</p>
              <a href={data.store_url_android} target="_blank" rel="noopener noreferrer" className="rr-btn rr-btn-gold rr-btn-lg mt-6 normal-case" data-testid="google-play-btn">
                <Play className="h-6 w-6 fill-current" aria-hidden /> Get it on Google Play
              </a>
              {data.latest_version && <p className="mt-4 text-sm text-muted-rr" data-testid="download-version">Latest version: {data.latest_version}</p>}
            </div>
          )}
          {data && !data.store_url_android && (
            <div className="rr-card p-8" data-testid="download-coming-soon">
              <Clock className="h-12 w-12 text-[#FFC107]" aria-hidden />
              <h2 className="mt-4 font-display text-3xl" data-testid="download-coming-soon-text">Coming soon to Google Play</h2>
              <p className="mt-2 max-w-lg text-[#d7e0f4]">
                We're getting the store listing ready. Follow the <Link to="/news" className="text-[#4da3ff] underline">News</Link> page to hear when Rush Rivals launches.
              </p>
            </div>
          )}
          <ul className="mt-8 space-y-2 text-[#d7e0f4]">
            <li className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-[#4da3ff]" aria-hidden /> Android phones, portrait mode</li>
            <li className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-[#4da3ff]" aria-hidden /> Free to play, with optional in-app purchases</li>
          </ul>
        </div>
        <div className="mx-auto w-60 lg:w-full"><PhoneShot name="menu" alt="Rush Rivals main menu" /></div>
      </Section>
    </div>
  );
}
