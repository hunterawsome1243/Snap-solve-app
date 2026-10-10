// What the loading screens say while a scan runs. The line changes every PROGRESS_MS so a wait feels shorter and
// says what is happening. Shared with the phone artifact (inlined by artifact/build.py), so keep this file import-free.

export const PROGRESS_MS = 1600

export const PROGRESS = {
  read: ['Reading your handwriting…', 'Finding each problem…', 'Checking the symbols…'],
  formulate: ['Turning the words into an equation…', 'Naming the unknowns…'],
  solve: ['Working it out…', 'Checking it a second way…', 'Writing the steps…'],
  identify: ['Figuring out what this is…', 'Naming the brand and model…'],
  barcode: ['Reading the barcode…', 'Trying it a few ways…'],
  stores: ['Thinking about who stocks this…', 'Ranking the stores…'],
  prices: ['Searching stores…', 'Comparing prices…', 'Picking the best deal…'],
  plant: ['Looking at the leaves…', 'Checking its health…', 'Writing care tips…'],
  food: ['Looking at your food…', 'Working out portions…', 'Checking for allergens…'],
  species: ['Looking closely…', 'Checking markings and shape…', 'Weighing up look-alikes…'],
}

// The line to show on tick `i`; it loops. An empty list shows nothing.
export const lineAt = (i, list) => (Array.isArray(list) && list.length ? list[((i % list.length) + list.length) % list.length] : '')
