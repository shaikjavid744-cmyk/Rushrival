/// <reference types="jest" />
import { CHARACTERS } from "@/src/config/catalog";
import { LANGUAGES, missingKeys, t } from "@/src/i18n";

import { TUNING, timeAtZ, zAtTime } from "../constants";
import { GameEngine } from "../engine";
import { BONES, crashPose, jumpPose, landPose, RUN_FRAMES, runFrameRate, runPose, runPoseAt, slidePose, solve } from "../rig";
import { roofStartZ, Spawner } from "../spawner";
import { TUTORIAL_STEPS, TutorialController } from "../tutorial";

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("character rig", () => {
  it("run cycle has 8–12 keyframes played at 12–15 fps scaled by speed", () => {
    expect(RUN_FRAMES).toBeGreaterThanOrEqual(8);
    expect(RUN_FRAMES).toBeLessThanOrEqual(12);
    expect(runFrameRate(TUNING.startSpeed)).toBeCloseTo(12);
    expect(runFrameRate(TUNING.maxSpeed)).toBeCloseTo(15);
    expect(runFrameRate(15)).toBeGreaterThan(12);
  });

  it("legs and arms move in anti-phase; the cycle loops", () => {
    for (let i = 0; i < RUN_FRAMES; i++) {
      const p = runPose(i / RUN_FRAMES);
      expect(p.thighL).toBeCloseTo(-p.thighR, 5);
      expect(Math.sign(p.armL || 1)).toBe(Math.sign(-p.thighL || 1)); // left arm opposite to left leg
    }
    const a = runPoseAt(0);
    const b = runPoseAt(RUN_FRAMES);
    expect(a.thighL).toBeCloseTo(b.thighL, 5);
  });

  it("forward kinematics preserves bone lengths in every pose", () => {
    const poses = [runPose(0.13), runPose(0.61), jumpPose(9), jumpPose(0), jumpPose(-8), landPose(runPose(0.3), 1), slidePose(1), crashPose(runPose(0.2), 1)];
    for (const p of poses) {
      const s = solve(p);
      for (let i = 0; i < 2; i++) {
        expect(dist(s.hip[i], s.knee[i])).toBeCloseTo(BONES.thigh, 5);
        expect(dist(s.knee[i], s.ankle[i])).toBeCloseTo(BONES.shin, 5);
        expect(dist(s.elbow[i], s.hand[i])).toBeCloseTo(BONES.foreArm, 5);
      }
    }
  });

  it("slide keeps the body low; jump takeoff/air/fall are distinct", () => {
    expect(solve(slidePose(0)).neck[1]).toBeLessThan(1.0);
    expect(solve(runPose(0)).neck[1]).toBeGreaterThan(1.3);
    expect(jumpPose(9).thighR).toBeLessThan(0); // trailing leg back on takeoff
    expect(jumpPose(0).kneeL).toBeGreaterThan(80); // tuck at apex
    expect(jumpPose(-9).kneeL).toBeLessThan(jumpPose(0).kneeL - 30); // legs extend for landing
  });

  it("every character has a rig look", () => {
    for (const c of CHARACTERS) expect(c.rig).toBeDefined();
  });
});

describe("scheduled roof routes", () => {
  it("first roof route arrives ~30 s in, then every 15–25 s", () => {
    const sp = new Spawner(42);
    const roofs: number[] = [];
    let z = 0;
    let speed: number = TUNING.startSpeed;
    while (z < 4000) {
      const res = sp.generate(speed, z);
      const r = res.row;
      if (res.roofRoute) {
        expect(r.cells.every((c) => c === "train") && r.ramps.some(Boolean)).toBe(true);
        roofs.push(r.z);
      }
      z = r.z;
      speed = Math.min(TUNING.maxSpeed, speed + 0.05);
    }
    expect(roofs.length).toBeGreaterThan(5);
    expect(roofs[0]).toBeGreaterThanOrEqual(roofStartZ() - 1);
    for (let i = 1; i < roofs.length; i++) {
      const gap = timeAtZ(roofs[i]) - timeAtZ(roofs[i - 1]);
      expect(gap).toBeGreaterThanOrEqual(TUNING.roofEveryMin - 1.5); // row quantisation
      expect(gap).toBeLessThanOrEqual(TUNING.roofEveryMax + 3);
    }
    expect(Math.abs(zAtTime(timeAtZ(1234)) - 1234)).toBeLessThan(1e-6);
  });
});

describe("interactive tutorial", () => {
  const drive = (e: GameEngine, t: TutorialController, until: () => boolean, max = 4000) => {
    for (let i = 0; i < max && !until(); i++) {
      if (!t.waiting) e.update(1 / 60);
      t.tick(e);
    }
  };

  it("freezes at each step until the hinted action, rejects wrong actions, then completes", () => {
    const e = new GameEngine(7, { autoSpawn: false, powerups: false });
    const t = new TutorialController();
    t.start(e);
    for (const step of TUTORIAL_STEPS) {
      drive(e, t, () => t.waiting);
      expect(t.step?.id).toBe(step.id);
      const d = e.distance;
      for (let i = 0; i < 30; i++) t.tick(e); // frozen: no progress while waiting
      expect(e.distance).toBe(d);
      const wrong = step.action === "left" ? "right" : "left";
      expect(t.accept(wrong, e)).toBe(false);
      expect(t.accept(step.action, e)).toBe(true);
      e.input(step.action);
    }
    drive(e, t, () => t.done);
    expect(t.done).toBe(true);
    expect(e.crashed).toBe(false);
    expect(e.coinsCollected).toBeGreaterThan(0);
  });
});

describe("localization", () => {
  it("has exactly the 7 storyboard languages with core menu strings translated", () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(["en", "hi", "bn", "ta", "te", "kn", "ml"]);
    for (const l of LANGUAGES) {
      expect(missingKeys(l.id).filter((k) => ["play", "missions", "shop", "settings", "characters"].includes(k))).toEqual([]);
      if (l.id !== "en") expect(t("play", l.id)).not.toBe("Play");
    }
    expect(t("termsBody", "ta")).toBe(t("termsBody", "en")); // fallback
    expect(t("play", "xx")).toBe("Play");
  });
});
