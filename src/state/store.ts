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
  /** unspent clues */
  clues: number;
  /** highest clue tier bought, per level */
  clueTier: Record<string, number>;
  /** failed verifications per level, which eventually buy a free first clue */
  fails: Record<string, number>;

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
  recordSolve: (levelId: string, score: Score, par: Score, unlocks?: string) => boolean;
  /** returns false when there is nothing to spend */
  buyClue: (levelId: string, tier: number, cost: number) => boolean;
  noteFailure: (levelId: string) => void;
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
      clues: 0,
      clueTier: {},
      fails: {},

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
       * Buy a clue tier. Tiers are cumulative, so buying tier 3 grants 1 and 2
       * as well, and re-reading one you already own is free.
       */
      buyClue: (levelId, tier, cost) => {
        const have = get().clueTier[levelId] ?? 0;
        if (tier <= have) return true;
        if (get().clues < cost) return false;
        set({
          clues: get().clues - cost,
          clueTier: { ...get().clueTier, [levelId]: tier },
        });
        return true;
      },

      /**
       * Being stuck is not the same as being lazy.
       *
       * Charging a player to find out whether they are even close is a bad
       * trade, so enough failed attempts on one level grant its first clue
       * outright. It is the floor that stops a currency becoming a wall.
       */
      noteFailure: (levelId) => {
        const n = (get().fails[levelId] ?? 0) + 1;
        const fails = { ...get().fails, [levelId]: n };
        const tier = get().clueTier[levelId] ?? 0;
        if (n >= 3 && tier < 1) {
          set({ fails, clueTier: { ...get().clueTier, [levelId]: 1 } });
        } else {
          set({ fails });
        }
      },

      /**
       * Record a solve. Returns true when this run improved on any metric,
       * which is what the result screen calls out.
       */
      recordSolve: (levelId, score, par, unlocks) => {
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

        /**
         * Clues are minted by playing well, which is the whole point: it makes
         * the three metrics buy something instead of being a readout you
         * glance at. One for beating par on any metric, one for solving a
         * level having spent nothing on it.
         */
        let minted = 0;
        if (!prev) {
          const beatPar =
            score.components < par.components ||
            score.ticks < par.ticks ||
            score.area < par.area;
          if (beatPar) minted++;
          if ((get().clueTier[levelId] ?? 0) === 0) minted++;
        }

        set({
          solved: { ...get().solved, [levelId]: best },
          unlocked: unlocks && !unlocked.includes(unlocks) ? [...unlocked, unlocks] : unlocked,
          clues: get().clues + minted,
        });
        return improved;
      },
    }),
    {
      name: 'etch.progress',
      partialize: (s) => ({
        unlocked: s.unlocked,
        solved: s.solved,
        clues: s.clues,
        clueTier: s.clueTier,
        fails: s.fails,
      }),
    },
  ),
);
