/**
 * UI state only — tool, selection, run state, progress.
 *
 * Deliberately small. If the grid ever appears in here, the game is broken.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Dir, E } from '../sim/kinds';
import { Score, Verification } from '../game/level';

export type Screen = 'menu' | 'play';

export interface Best {
  components: number;
  ticks: number;
  area: number;
}

interface UIState {
  screen: Screen;
  levelId: string | null;
  /** currently selected palette entry id */
  tool: string;
  rot: Dir;
  running: boolean;
  /** simulation ticks per second */
  rate: number;
  verification: Verification | null;
  probeNet: number;
  showBrief: boolean;
  /** which timeline step the board is currently showing */
  playStep: number;

  // progress — the only persisted part
  unlocked: string[];
  solved: Record<string, Best>;

  setScreen: (s: Screen) => void;
  openLevel: (id: string) => void;
  openSandbox: () => void;
  setTool: (t: string) => void;
  rotate: () => void;
  setRunning: (r: boolean) => void;
  setRate: (r: number) => void;
  setVerification: (v: Verification | null) => void;
  setProbeNet: (n: number) => void;
  setShowBrief: (v: boolean) => void;
  setPlayStep: (n: number) => void;
  recordSolve: (levelId: string, score: Score, unlocks?: string) => boolean;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      screen: 'menu',
      levelId: null,
      tool: 'wire',
      rot: E,
      running: false,
      rate: 8,
      verification: null,
      probeNet: -1,
      showBrief: true,
      playStep: 0,

      unlocked: [],
      solved: {},

      setScreen: (screen) => set({ screen }),
      openLevel: (levelId) =>
        set({ levelId, screen: 'play', tool: 'wire', verification: null, running: false, showBrief: true, playStep: 0 }),
      // the sandbox has no level, and forgetting to say so left it wearing the
      // previous level's palette, brief, par and verification panel
      openSandbox: () =>
        set({ levelId: null, screen: 'play', tool: 'wire', verification: null, running: false, showBrief: false }),
      setTool: (tool) => set({ tool, probeNet: -1 }),
      rotate: () => set({ rot: ((get().rot + 1) & 3) as Dir }),
      setRunning: (running) => set({ running }),
      setRate: (rate) => set({ rate }),
      setVerification: (verification) => set({ verification }),
      setProbeNet: (probeNet) => set({ probeNet }),
      setShowBrief: (showBrief) => set({ showBrief }),
      setPlayStep: (playStep) => set({ playStep }),

      /**
       * Record a solve. Returns true when this run improved on any metric,
       * which is what the result screen calls out.
       */
      recordSolve: (levelId, score, unlocks) => {
        const prev = get().solved[levelId];
        const best: Best = prev
          ? {
              components: Math.min(prev.components, score.components),
              ticks: Math.min(prev.ticks, score.ticks),
              area: Math.min(prev.area, score.area),
            }
          : { ...score };
        const improved =
          !prev ||
          best.components < prev.components ||
          best.ticks < prev.ticks ||
          best.area < prev.area;
        const unlocked = get().unlocked;
        set({
          solved: { ...get().solved, [levelId]: best },
          unlocked: unlocks && !unlocked.includes(unlocks) ? [...unlocked, unlocks] : unlocked,
        });
        return improved;
      },
    }),
    {
      name: 'etch.progress',
      partialize: (s) => ({ unlocked: s.unlocked, solved: s.solved }),
    },
  ),
);
