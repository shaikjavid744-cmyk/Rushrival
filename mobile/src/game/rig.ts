/**
 * 2D cut-out character rig (pure TS, no rendering). Poses are joint angles in the runner's sagittal plane;
 * `solve()` turns a pose into 3D joint positions (metres, x = right, y = up, z = forward).
 * The run cycle is a 10-keyframe loop played at 12–15 keyframes/s (scaled by speed) with interpolation.
 */
export interface Pose {
  lean: number; // torso pitch, deg (+ forward)
  roll: number; // torso side roll, deg
  hipY: number; // pelvis height, m
  thighL: number; // deg from straight down, + forward
  kneeL: number; // knee flex, deg (+ bends shin backward)
  thighR: number;
  kneeR: number;
  armL: number; // shoulder, deg from straight down, + forward
  elbowL: number; // elbow flex, deg (+ forearm forward/up)
  armR: number;
  elbowR: number;
}

export const RUN_FRAMES = 10;
export const BONES = { thigh: 0.44, shin: 0.44, torso: 0.52, upperArm: 0.29, foreArm: 0.26, head: 0.125, hipHalf: 0.1, shoulderHalf: 0.19 };

const D = Math.PI / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Keyframes per second for the run cycle: 12 at start speed → 15 at max speed. */
export function runFrameRate(speed: number, start = 8.5, max = 26): number {
  return 12 + 3 * clamp01((speed - start) / (max - start));
}

/** Run cycle keyframe at phase 0..1 (left leg forward at 0.25). */
export function runPose(phase: number): Pose {
  const t = phase * Math.PI * 2;
  const leg = (o: number) => ({ thigh: 40 * Math.sin(t + o), knee: 14 + 88 * Math.max(0, -Math.sin(t + o - 0.6)) });
  const L = leg(0);
  const R = leg(Math.PI);
  return {
    lean: 13,
    roll: 4 * Math.sin(t),
    hipY: 0.9 + 0.055 * Math.abs(Math.sin(t)),
    thighL: L.thigh,
    kneeL: L.knee,
    thighR: R.thigh,
    kneeR: R.knee,
    armL: -46 * Math.sin(t),
    elbowL: 78 + 18 * Math.sin(t),
    armR: 46 * Math.sin(t),
    elbowR: 78 - 18 * Math.sin(t),
  };
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const o = {} as Pose;
  for (const key in a) (o as any)[key] = (a as any)[key] + ((b as any)[key] - (a as any)[key]) * k;
  return o;
}

/** Interpolated run pose for a continuous frame counter (frames advance at runFrameRate). */
export function runPoseAt(frame: number): Pose {
  const f = ((frame % RUN_FRAMES) + RUN_FRAMES) % RUN_FRAMES;
  const i = Math.floor(f);
  return lerpPose(runPose(i / RUN_FRAMES), runPose(((i + 1) % RUN_FRAMES) / RUN_FRAMES), f - i);
}

const TAKEOFF: Pose = { lean: 12, roll: 0, hipY: 0.98, thighL: 66, kneeL: 88, thighR: -22, kneeR: 72, armL: -35, elbowL: 70, armR: 75, elbowR: 60 };
const AIR: Pose = { lean: 6, roll: 0, hipY: 1.0, thighL: 58, kneeL: 100, thighR: 34, kneeR: 92, armL: 40, elbowL: 50, armR: -25, elbowR: 70 };
const FALL: Pose = { lean: 4, roll: 0, hipY: 0.96, thighL: 30, kneeL: 55, thighR: 12, kneeR: 38, armL: 95, elbowL: 30, armR: 85, elbowR: 30 };
const LAND: Pose = { lean: 30, roll: 0, hipY: 0.7, thighL: 48, kneeL: 88, thighR: 38, kneeR: 82, armL: 42, elbowL: 40, armR: 36, elbowR: 40 };
const SLIDE: Pose = { lean: 48, roll: 0, hipY: 0.4, thighL: 72, kneeL: 135, thighR: 58, kneeR: 128, armL: -35, elbowL: 60, armR: -40, elbowR: 55 };
const CRASH: Pose = { lean: 82, roll: 24, hipY: 0.5, thighL: 12, kneeL: 45, thighR: -32, kneeR: 75, armL: 150, elbowL: 25, armR: 125, elbowR: 40 };

/** Jump: takeoff (rising fast) → tuck at apex → legs extend while falling. */
export function jumpPose(vy: number): Pose {
  if (vy > 2) return lerpPose(AIR, TAKEOFF, clamp01((vy - 2) / 7));
  return lerpPose(FALL, AIR, clamp01((vy + 7) / 9));
}

/** Landing crouch blended over the run pose (k = 1 at touchdown → 0). */
export function landPose(run: Pose, k: number): Pose {
  return lerpPose(run, LAND, clamp01(k));
}

export function slidePose(t: number): Pose {
  const p = { ...SLIDE };
  p.armL += 6 * Math.sin(t * 9);
  return p;
}

export function crashPose(from: Pose, k: number): Pose {
  return lerpPose(from, CRASH, clamp01(k));
}

export type V3 = [number, number, number];
export interface Skeleton {
  pelvis: V3;
  neck: V3;
  head: V3;
  hip: [V3, V3]; // L, R
  knee: [V3, V3];
  ankle: [V3, V3];
  toe: [V3, V3];
  shoulder: [V3, V3];
  elbow: [V3, V3];
  hand: [V3, V3];
}

/** Forward kinematics. */
export function solve(p: Pose): Skeleton {
  const B = BONES;
  const lean = p.lean * D;
  const pelvis: V3 = [0, p.hipY, 0];
  const neck: V3 = [0, p.hipY + B.torso * Math.cos(lean), B.torso * Math.sin(lean)];
  const head: V3 = [0, neck[1] + (B.head + 0.04) * Math.cos(lean * 0.6), neck[2] + (B.head + 0.04) * Math.sin(lean * 0.6)];
  const leg = (side: number, thighDeg: number, kneeDeg: number) => {
    const a = thighDeg * D;
    const b = (thighDeg - kneeDeg) * D;
    const hip: V3 = [side * B.hipHalf, p.hipY, 0];
    const knee: V3 = [hip[0], hip[1] - B.thigh * Math.cos(a), hip[2] + B.thigh * Math.sin(a)];
    const ankle: V3 = [hip[0], knee[1] - B.shin * Math.cos(b), knee[2] + B.shin * Math.sin(b)];
    const f = b + Math.PI / 2; // foot points forward, perpendicular to shin
    const toe: V3 = [hip[0], ankle[1] - 0.17 * Math.cos(f), ankle[2] + 0.17 * Math.sin(f)];
    return { hip, knee, ankle, toe };
  };
  const arm = (side: number, armDeg: number, elbowDeg: number) => {
    const a = armDeg * D;
    const b = (armDeg + elbowDeg) * D;
    const shoulder: V3 = [side * B.shoulderHalf, neck[1] - 0.05, neck[2] - 0.01];
    const elbow: V3 = [shoulder[0] + side * 0.03, shoulder[1] - B.upperArm * Math.cos(a), shoulder[2] + B.upperArm * Math.sin(a)];
    const hand: V3 = [elbow[0], elbow[1] - B.foreArm * Math.cos(b), elbow[2] + B.foreArm * Math.sin(b)];
    return { shoulder, elbow, hand };
  };
  const L = leg(-1, p.thighL, p.kneeL);
  const R = leg(1, p.thighR, p.kneeR);
  const AL = arm(-1, p.armL, p.elbowL);
  const AR = arm(1, p.armR, p.elbowR);
  return {
    pelvis,
    neck,
    head,
    hip: [L.hip, R.hip],
    knee: [L.knee, R.knee],
    ankle: [L.ankle, R.ankle],
    toe: [L.toe, R.toe],
    shoulder: [AL.shoulder, AR.shoulder],
    elbow: [AL.elbow, AR.elbow],
    hand: [AL.hand, AR.hand],
  };
}
