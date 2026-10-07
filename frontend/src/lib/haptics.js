// A tiny buzz on capture and on a right answer. Phones that cannot vibrate (iPhone Safari) simply skip it.
export function buzz(ms = 15) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}
