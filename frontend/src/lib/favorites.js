// The scanners, and the two favourite slots in the bottom bar. All scanners live in the Extras tab;
// the star on a scanner pins it to a slot. Shared with the phone artifact.

export const SCANNERS = [
  { id: 'solve', label: 'Solve', title: 'Math Solver', blurb: 'Photograph a problem and get steps that are checked twice.', icon: 'camera' },
  { id: 'buy', label: 'Snap Buy', title: 'Snap Buy', blurb: 'Find the best price and store from a photo or a barcode.', icon: 'bag' },
  { id: 'plants', label: 'Plant', title: 'Plant Scan', blurb: 'Identify a plant, check its health and get care tips.', icon: 'leaf' },
  { id: 'food', label: 'Food', title: 'Food Scan', blurb: 'Estimate calories and nutrients from a meal or a label.', icon: 'food' },
  { id: 'species', label: 'Species', title: 'Species Scan', blurb: 'Identify an animal, bird, insect, fish or fungus.', icon: 'paw' },
]
export const MAX_FAVS = 2
export const DEFAULT_FAVS = ['solve', 'buy']

const known = new Set(SCANNERS.map((s) => s.id))
export const scannerById = (id) => SCANNERS.find((s) => s.id === id)

// Whatever was stored: only real scanners, no repeats, at most two. Nothing stored means the defaults.
export function cleanFavs(v) {
  if (!Array.isArray(v)) return [...DEFAULT_FAVS]
  return [...new Set(v.filter((x) => known.has(x)))].slice(0, MAX_FAVS)
}

// Tap the star: unpin it if pinned; otherwise pin it, and when both slots are taken the oldest pin makes room.
export function toggleFav(favs, id) {
  if (!known.has(id)) return { favs, dropped: null }
  if (favs.includes(id)) return { favs: favs.filter((x) => x !== id), dropped: null }
  const dropped = favs.length >= MAX_FAVS ? favs[0] : null
  return { favs: [...favs.slice(dropped ? 1 : 0), id], dropped }
}
