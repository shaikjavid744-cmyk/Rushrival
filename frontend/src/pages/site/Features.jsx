import { MoveHorizontal, Zap, Users, Globe2, Target, CalendarCheck, BarChart3, WifiOff, Cloud, Accessibility } from "lucide-react";
import { Seo } from "@/lib/seo";
import { PageHero, Section, GameLink } from "@/components/site/States";
import { PhoneShot } from "@/components/site/PhoneShot";

const FEATURES = [
  [MoveHorizontal, "Swipe to dodge", "Three lanes and a run that keeps speeding up. Swipe left or right to switch lanes, up to jump and down to slide. Inputs are buffered so quick swipes never get lost."],
  [Zap, "Five power-ups", "Coin Magnet, Shield, Speed Boost, Score x2 and the Hoverboard that saves you from one crash per run."],
  [Users, "Six rivals to unlock", "Start as Rush, then unlock Zoe, Kai, Shadow, Nova and Leo with coins, gems or rewarded ads."],
  [Globe2, "Six worlds and six boards", "Run through City, Beach, Snow, Night City, Temple and Lava on boards from Flame to Galaxy."],
  [Target, "Missions and achievements", "Daily missions and long-term achievements reward you for runs, coins and distance."],
  [CalendarCheck, "7-day daily rewards", "Come back every day to build your streak and collect bigger rewards."],
  [BarChart3, "Leaderboards and events", "Sign in to post server-validated scores on daily, weekly and all-time boards and join limited-time events."],
  [WifiOff, "Plays offline", "Gameplay never needs a connection. Your progress is saved on your device."],
  [Cloud, "Optional cloud save", "Create an account with email or Google to keep your progress safe across devices."],
  [Accessibility, "Accessible controls", "On-screen touch buttons, sound, music and vibration toggles, and clear high-contrast HUD."],
];

export default function Features() {
  return (
    <div data-testid="features-page">
      <Seo title="Features" path="/features" description="Everything in Rush Rivals: 3-lane swipe controls, power-ups, six characters, six worlds, missions, daily rewards, leaderboards and offline play." />
      <PageHero eyebrow="What's in the game" title="Features">
        <p>Rush Rivals is a fast arcade endless runner built for quick sessions and long streaks. Here's everything you get.</p>
      </PageHero>
      <Section className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <ul className="grid gap-5 sm:grid-cols-2" data-testid="features-list">
          {FEATURES.map(([Icon, t, d], i) => (
            <li key={t} className="rr-card rr-rise p-6" style={{ animationDelay: `${i * 50}ms` }} data-testid={`feature-${i}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFC107] text-[#3A1C00] shadow-[0_4px_0_#B37A00]">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-2xl">{t}</h2>
              <p className="mt-2 leading-relaxed text-[#d7e0f4]">{d}</p>
            </li>
          ))}
        </ul>
        <aside className="hidden flex-col gap-8 lg:flex" aria-label="Screenshots">
          <PhoneShot name="obstacles" alt="Trains and barriers across three lanes" />
          <PhoneShot name="characters" alt="Character selection screen" />
        </aside>
      </Section>
      <Section className="!pt-0">
        <div className="flex flex-wrap gap-4">
          <GameLink to="/download" variant="gold" testid="features-download-cta">Download</GameLink>
          <GameLink to="/characters" variant="blue" testid="features-characters-cta">Meet the characters</GameLink>
        </div>
      </Section>
    </div>
  );
}
