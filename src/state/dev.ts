/**
 * Developer mode, behind `?dev` in the URL.
 *
 * Playing eleven levels to reach the twelfth is the right experience for a
 * player and the wrong one for whoever is building level twelve. Dev mode
 * unlocks the menu, grants every blueprint, and puts a jump-and-solve bar on
 * the board.
 *
 * It is a URL flag rather than a build flag on purpose: the bugs worth finding
 * are in the deployed build, on a real phone, and a build that cannot be
 * inspected there is a build you debug by guessing.
 */

export const DEV =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');
