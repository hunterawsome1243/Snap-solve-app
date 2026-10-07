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
export const solve = (latex, simple, context) => post('/api/solve', { latex, simple, context: context || null })
export const formulate = (text) => post('/api/formulate', { text })
export const practice = ({ difficulty, topic, latex }) => post('/api/practice', { difficulty, topic, latex: latex || null })
export const practiceCheck = (problem, answer) => post('/api/practice/check', { problem, answer })
export const rankOffers = (body) => post('/api/buy/rank', body)

const country = () => (navigator.language || 'en-US').split('-')[1]?.toUpperCase() || 'US'
export const identifyProduct = (dataUrl) => {
  const [head, image] = dataUrl.split(',')
  return post('/api/buy/identify', { image, media_type: head.match(/data:(.*?);/)[1] })
}
export const findPrices = (query) => post('/api/buy/prices', { query, country: country() })
