import type { Lane } from "./constants";

export type ObstacleKind = "low" | "high" | "train";

export interface Obstacle {
  active: boolean;
  kind: ObstacleKind;
  lane: Lane;
  z: number; // front edge (absolute track metres)
  depth: number;
}

export interface Coin {
  active: boolean;
  lane: Lane;
  z: number;
  y: number;
}

export type Cell = ObstacleKind | null;

export interface Row {
  z: number;
  cells: [Cell, Cell, Cell]; // index 0 = lane -1, 1 = lane 0, 2 = lane +1
  length: number;
}

export interface CoinSpec {
  lane: Lane;
  z: number;
  y: number;
}
