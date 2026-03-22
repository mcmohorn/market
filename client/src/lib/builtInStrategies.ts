/**
 * Built-in ML-evolved strategy presets for the Simulation Lab.
 *
 * This file is OVERWRITTEN by:   npx tsx scripts/apply-strategies.ts
 * Which reads the output of:     npx tsx scripts/strategy-lab.ts
 *
 * Until the strategy lab has been run, this file contains empty placeholder
 * data so the UI compiles cleanly.
 */
import type { StrategyParams } from "../../../shared/types";

export interface BuiltInPreset {
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  params: StrategyParams;
  symbols: string[];
  exchange: string;
  assetType: string;
}

export const BUILT_IN_STRATEGIES: BuiltInPreset[] = [];

// Filled in after running strategy-lab.ts
export const NN_WEIGHTS: number[] = [];
export const NN_ARCH = { inputs: 6, hidden: 12, outputs: 1 };
