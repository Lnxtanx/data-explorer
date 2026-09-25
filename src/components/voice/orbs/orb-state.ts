// =============================================================================
// Orb state vocabulary, motion maths, and the CSS-variable builder.
//
// This file is the merge of two modules that were split apart in Phase 2:
//
//   lib/voice/orb-state.ts                          pure vocabulary + maths
//   ai/voice/orbs/orb-state.ts                      React props + orbVars
//
// The split existed because `lib/voice/types.ts` and `hooks/voice/useVoiceSession.ts`
// both need to name an OrbState, and they sat below the component layer. The only
// thing above the layer was `orbs/index.ts`, whose `export *` re-exports
// IridescentFlow - a 449-line WebGL renderer. Importing a type from there pulled
// the whole renderer into a type position, so the pure half was pushed down and
// the component half re-exported it to keep every existing import path valid.
//
// Now that the whole domain lives in one folder, the two halves live in one file
// again, but the reason the split mattered still does:
//
//   * `orbs/index.ts` still re-exports IridescentFlow.
//   * Anything needing only an OrbState must import from THIS file directly,
//     never from `../orbs` or from `@/components/voice`.
//
// Invariant: consumers that only need the type MUST import from
// '@/components/voice/orbs/orb-state', not from the orbs barrel and not from
// the feature root.
// =============================================================================

// --- Pure vocabulary + motion maths (no React, no WebGL, no DOM) ------------

export type OrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'disabled';

export const ORB_STATES = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
] as const satisfies readonly OrbState[];

export const ERROR_COLOR_FROM = '#fb7185';
export const ERROR_COLOR_TO = '#f43f5e';

export const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export type OrbMotion = 'ripple' | 'pulse' | 'flow' | 'none';

export const stateMotion = (state: OrbState): OrbMotion => {
  switch (state) {
    case 'listening':
      return 'ripple';
    case 'thinking':
      return 'pulse';
    case 'speaking':
      return 'flow';
    default:
      return 'none';
  }
};

export const stateEnergy = (state: OrbState, t: number): number => {
  switch (state) {
    case 'listening':
      return 0.4 + 0.32 * Math.abs(Math.sin(t * 8.5)) + 0.18 * Math.abs(Math.sin(t * 4.1 + 1.5));
    case 'speaking':
      return 0.3 + 0.24 * Math.abs(Math.sin(t * 6.2)) + 0.16 * Math.abs(Math.sin(t * 3 + 0.6));
    case 'thinking':
      return 0.24 + 0.2 * Math.abs(Math.sin(t * 2.4));
    case 'connecting':
      return 0.12 + 0.1 * Math.abs(Math.sin(t * 1.6));
    case 'error':
      return 0.2;
    default:
      return 0;
  }
};

export const approach = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export type StateWeights = Record<OrbState, number>;

export interface StateMix {
  weights: StateWeights;
  update: (state: OrbState, dt: number, rate?: number) => StateWeights;
}

export const createStateMix = (initial: OrbState = 'idle'): StateMix => {
  const weights: StateWeights = {
    idle: 0,
    connecting: 0,
    listening: 0,
    thinking: 0,
    speaking: 0,
    error: 0,
    disabled: 0,
  };
  weights[initial] = 1;
  const keys = Object.keys(weights) as OrbState[];
  const update = (state: OrbState, dt: number, rate = 6): StateWeights => {
    let total = 0;
    for (const key of keys) {
      const target = key === state ? 1 : 0;
      const next = approach(weights[key], target, rate, dt);
      weights[key] = target === 0 && next < 0.001 ? 0 : next;
      total += weights[key];
    }
    if (total > 0) {
      for (const key of keys) weights[key] /= total;
    }
    return weights;
  };
  return { weights, update };
};

// --- React surface ---------------------------------------------------------
//
// orbVars stays in this file because it is a React CSSProperties builder whose
// inputs are exactly OrbProps. It is small and pulls in no renderer, so keeping
// it here does not re-create the layering problem the split was solving.

import type { CSSProperties, Ref, RefObject } from 'react';

export interface OrbProps {
  state?: OrbState;
  size?: number;
  speed?: number;
  colorFrom?: string;
  colorTo?: string;
  levelRef?: RefObject<number>;
  label?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export const orbVars = ({
  size,
  speed,
  colorFrom,
  colorTo,
}: Pick<OrbProps, 'size' | 'speed' | 'colorFrom' | 'colorTo'>): CSSProperties => {
  const vars: Record<string, string> = {};
  if (size != null) vars['--orb-size'] = `${size}px`;
  if (speed != null) vars['--orb-speed'] = `${speed}`;
  if (colorFrom) vars['--orb-color-from'] = colorFrom;
  if (colorTo) vars['--orb-color-to'] = colorTo;
  return vars as CSSProperties;
};
