import type { NavigateFunction } from 'react-router';

/** Lets non-component code (e.g. toast actions) navigate without a full reload. */
let navigateRef: NavigateFunction | null = null;

export function registerNavigate(fn: NavigateFunction | null) {
  navigateRef = fn;
}

export function navigateTo(path: string) {
  if (navigateRef) void navigateRef(path);
  else window.location.assign(path);
}
