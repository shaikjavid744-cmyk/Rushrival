import { Link } from "react-router-dom";
import { Seo } from "@/lib/seo";
import { useConsent } from "@/lib/consent";
import { PageHero, Section } from "@/components/site/States";

const UPDATED = "October 2026";

const PRIVACY = [
  ["Who we are", "Rush Rivals is made by Velactra Game Studio. This policy explains what the game and this website collect and why."],
  ["Playing as a guest", "You can play without an account. Your runner name, progress, coins, gems, unlocks and settings are stored only on your device. Gameplay never needs a network connection."],
  ["If you create an account", "When you sign in with email and password or Google, we store your email, display name, cloud save (progress, wallet, inventory), a ledger of coin and gem changes, validated run results and leaderboard scores. Passwords are stored as one-way hashes."],
  ["Purchases", "In-app purchases are processed by Google Play. We receive and verify the purchase receipt to deliver your items; we never see your card details."],
  ["Ads and diagnostics", "The game may show rewarded ads (you choose to watch them) and uses crash and analytics tools only with your consent, which you can change in Settings."],
  ["Support", "When you contact us (in the app or on this website), we store your name, email, category and message to answer you, and send you a confirmation email."],
  ["Children", "Players under 13 play in child mode: purchase prompts remind them to ask a parent."],
  ["Your rights", "You can ask us what we hold about you or delete your data. See Account & Data Deletion for how to delete your account. Contact us through the Support page for anything else."],
];

const TERMS = [
  ["Licence", "Velactra Game Studio grants you a personal, non-transferable licence to play Rush Rivals."],
  ["Accounts", "Keep your sign-in details safe. You're responsible for activity on your account."],
  ["Virtual items", "Coins, gems and unlocks have no real-world value and cannot be exchanged for money. Purchases are handled by Google Play under its refund policy."],
  ["Fair play", "Don't cheat, modify the game or its save files, or abuse other players. Scores are validated on our servers; we may remove scores and suspend or ban accounts that break these rules."],
  ["Changes", "We may update the game and these terms. Continued play means you accept the updated terms."],
  ["Disclaimer", "The game is provided as is, without warranties of any kind, to the extent permitted by law."],
];

function Doc({ title, path, description, sections, testid, children }) {
  return (
    <div data-testid={testid}>
      <Seo title={title} path={path} description={description} />
      <PageHero eyebrow={`Last updated: ${UPDATED}`} title={title} />
      <Section className="max-w-3xl">
        <div className="prose-rr">
          {sections.map(([h, b]) => (
            <section key={h}>
              <h2>{h}</h2>
              <p>{b}</p>
            </section>
          ))}
        </div>
        {children}
      </Section>
    </div>
  );
}

export const Privacy = () => (
  <Doc title="Privacy Policy" path="/privacy" testid="privacy-page" description="How Rush Rivals and Velactra Game Studio handle your data: guest play, accounts, purchases, ads and support." sections={PRIVACY}>
    <p className="mt-6 text-[#d7e0f4]">See also: <Link to="/cookies" className="text-[#4da3ff] underline">Cookie & Consent</Link> · <Link to="/account-deletion" className="text-[#4da3ff] underline">Account & Data Deletion</Link></p>
  </Doc>
);

export const Terms = () => (
  <Doc title="Terms of Service" path="/terms" testid="terms-page" description="The terms for playing Rush Rivals: licence, accounts, virtual items and fair play." sections={TERMS} />
);

export function Cookies() {
  const { consent, reopen } = useConsent();
  const sections = [
    ["Essential storage", "This website stores your cookie choice in your browser's local storage so we don't ask again. That's needed for the site to work and is always on."],
    ["Optional analytics", "Analytics would help us understand which pages are useful. They load only if you click Accept. No analytics provider is set up on this website right now, so accepting currently turns nothing on."],
    ["Admin area", "Staff sign-in uses a secure session cookie that only applies to the admin area."],
    ["In the game", "The Android game asks for its own consent for ads and diagnostics. You can change that in the game's Settings."],
  ];
  return (
    <Doc title="Cookie & Consent" path="/cookies" testid="cookies-page" description="What Rush Rivals' website stores in your browser and how to change your cookie choice." sections={sections}>
      <div className="rr-card mt-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="cookie-current-choice">
          Your current choice: <strong className="text-[#FFC107]">{consent ? (consent.choice === "accepted" ? "Accepted" : "Rejected") : "Not chosen yet"}</strong>
        </p>
        <button type="button" className="rr-btn rr-btn-blue !min-h-[48px] !text-base" onClick={reopen} data-testid="cookie-change-btn">Change my choice</button>
      </div>
    </Doc>
  );
}
