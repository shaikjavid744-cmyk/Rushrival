import { Link } from "react-router-dom";
import { Seo } from "@/lib/seo";
import { publicApi } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHero, Section, ServiceError, EmptyState } from "@/components/site/States";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Faq() {
  const { data, error, loading, reload } = useAsync(() => publicApi.get("/faq"), []);
  const items = data?.items || [];
  return (
    <div data-testid="faq-page">
      <Seo title="FAQ" path="/faq" description="Answers to common questions about Rush Rivals: gameplay, accounts, purchases, saves and support." />
      <PageHero eyebrow="Help" title="Frequently asked questions">
        <p>Can't find your answer? <Link to="/support" className="text-[#4da3ff] underline">Contact support</Link>.</p>
      </PageHero>
      <Section className="max-w-4xl">
        {loading && <div className="h-64 animate-pulse rounded-3xl bg-[#16224A]" aria-busy="true" data-testid="faq-loading" />}
        {error && <ServiceError error={error} onRetry={reload} />}
        {data && items.length === 0 && <EmptyState title="No questions yet" testid="faq-empty" />}
        {items.length > 0 && (
          <Accordion type="single" collapsible className="space-y-4" data-testid="faq-accordion">
            {items.map((f) => (
              <AccordionItem key={f.faq_id} value={f.faq_id} className="rr-card overflow-hidden !border-b-2 px-2" data-testid={`faq-item-${f.faq_id}`}>
                <AccordionTrigger className="px-4 py-5 text-left font-display text-xl hover:no-underline focus-visible:outline-[3px]" data-testid={`faq-trigger-${f.faq_id}`}>
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-5 text-base leading-relaxed text-[#d7e0f4] whitespace-pre-line" data-testid={`faq-answer-${f.faq_id}`}>
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </Section>
    </div>
  );
}
