async function post(path, body) {
  let res
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Can't reach the SnapSolve server. Is the backend running?")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Server error (${res.status})`)
  return data
}

export const readImage = (dataUrl) => {
  const [head, image] = dataUrl.split(',')
  const media_type = head.match(/data:(.*?);/)[1]
  return post('/api/read', { image, media_type })
}
export const solve = (latex, simple) => post('/api/solve', { latex, simple })
export const practice = (latex) => post('/api/practice', { latex })
