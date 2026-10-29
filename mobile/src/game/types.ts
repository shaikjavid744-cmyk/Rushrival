import type { Lane } from "./constants";

export type ObstacleKind = "low" | "high" | "train";
export type PowerUpKind = "magnet" | "shield" | "speed" | "x2" | "hoverboard";

export interface Obstacle {
  active: boolean;
  kind: ObstacleKind;
  lane: Lane;
  z: number; // front edge (absolute track metres)
  depth: number;
  ramp: boolean; // ramp in front of the train leading onto its roof
  moving: boolean; // oncoming train
  vz: number; // current velocity (negative = toward runner)
  row: Row | null;
}

export interface Coin {
  active: boolean;
  lane: Lane;
  z: number;
  y: number;
  x: number; // lateral position (lane units) — magnet can pull it
}

export interface Pickup {
  active: boolean;
  kind: PowerUpKind;
  lane: Lane;
  z: number;
  y: number;
}

export type Cell = ObstacleKind | null;

export interface Row {
  z: number;
  cells: [Cell, Cell, Cell]; // index 0 = lane -1, 1 = lane 0, 2 = lane +1
  length: number;
  ramps: [boolean, boolean, boolean];
  moving: [boolean, boolean, boolean];
}

export interface CoinSpec {
  lane: Lane;
  z: number;
  y: number;
}
