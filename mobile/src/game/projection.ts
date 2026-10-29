import { TUNING } from "./constants";

/** 2.5D behind-the-runner pseudo perspective. dz = metres ahead of the runner. */
export interface Viewport {
  width: number;
  height: number;
  horizonY: number;
  playerY: number;
  lanePx: number; // lane width in px at the runner's depth
  camBack: number;
  nearDz: number;
}

export function makeViewport(width: number, height: number): Viewport {
  const camBack = 6;
  return {
    width,
    height,
    horizonY: height * 0.36,
    playerY: height * 0.8,
    lanePx: Math.min(width * 0.3, height * 0.16),
    camBack,
    nearDz: -camBack * 0.7,
  };
}

export function depthScale(vp: Viewport, dz: number): number {
  return vp.camBack / Math.max(0.05, dz + vp.camBack);
}

export function groundY(vp: Viewport, dz: number): number {
  return vp.horizonY + (vp.playerY - vp.horizonY) * depthScale(vp, dz);
}

export function laneX(vp: Viewport, laneUnits: number, dz: number): number {
  return vp.width / 2 + laneUnits * vp.lanePx * depthScale(vp, dz);
}

export function metrePx(vp: Viewport): number {
  return vp.lanePx / TUNING.laneWidthM;
}
