/** In-memory dirty flag so Saved screen can skip full reloads when nothing changed. */

let dirty = true;

export function markCouponsDirty() {
  dirty = true;
}

export function consumeCouponsDirty(): boolean {
  if (!dirty) return false;
  dirty = false;
  return true;
}

export function peekCouponsDirty(): boolean {
  return dirty;
}
