/**
 * Injectable clock — route all time decisions through this seam so tests
 * can override `now()`. Never call Date.now() or new Date() inline.
 */

export type ClockNow = () => Date;

let _now: ClockNow = () => new Date();

export function now(): Date {
  return _now();
}

export function setClock(fn: ClockNow): void {
  _now = fn;
}

export function resetClock(): void {
  _now = () => new Date();
}
