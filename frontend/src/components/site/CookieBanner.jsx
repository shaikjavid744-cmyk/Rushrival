import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { useConsent } from "@/lib/consent";

export default function CookieBanner() {
  const { open, choose } = useConsent();
  if (!open) return null;
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      className="rr-rise fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-3xl border-2 border-[#3D5699] bg-[#16224A] p-5 shadow-2xl sm:p-6"
      data-testid="cookie-banner"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Cookie className="hidden h-10 w-10 shrink-0 text-[#FFC107] sm:block" aria-hidden />
        <div className="flex-1">
          <h2 id="cookie-title" className="font-display text-xl">Cookies on this site</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#d7e0f4]">
            We only use what the site needs to work (like remembering this choice). Optional analytics stay off unless you accept.{" "}
            <Link to="/cookies" className="text-[#4da3ff] underline" data-testid="cookie-banner-learn-more">Learn more</Link>
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="rr-btn rr-btn-navy !min-h-[48px] !text-base" onClick={() => choose("rejected")} data-testid="cookie-reject-btn">
            Reject
          </button>
          <button type="button" className="rr-btn rr-btn-blue !min-h-[48px] !text-base" onClick={() => choose("accepted")} data-testid="cookie-accept-btn">
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
