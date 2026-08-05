/**
 * The debug surface, published on `window.etch`.
 *
 * It exists so a headless browser can drive the real board — the same
 * transform, the same world, the same router — instead of a test-only
 * reimplementation that can agree with itself while the game is broken.
 * Modules that own state a harness needs (the viewport lives in a ref inside
 * Board) write it here rather than exporting it and inviting real code to
 * reach for it.
 */

export const debug: Record<string, unknown> = {};

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).etch = debug;
}
