// A hosted copy asks for an access code (ACCESS_CODE on the server). It is asked once and remembered on this device.
const getCode = () => { try { return localStorage.getItem('hs-code') || '' } catch { return '' } }
const setCode = (c) => { try { localStorage.setItem('hs-code', c) } catch {} }

async function send(path, body) {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Code': getCode() },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Can't reach the Hunter Scan server. Is the backend running?")
  }
}

async function post(path, body) {
  let res = await send(path, body)
  if (res.status === 401) {
    const code = window.prompt('Enter the Hunter Scan access code')
    if (code) { setCode(code.trim()); res = await send(path, body) }
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

export const scanPlant = (dataUrl, note) => {
  const [head, image] = dataUrl.split(',')
  return post('/api/plant/scan', { image, media_type: head.match(/data:(.*?);/)[1], note: note || '' })
}

export const scanFood = (dataUrl, note) => {
  const [head, image] = dataUrl.split(',')
  return post('/api/food/scan', { image, media_type: head.match(/data:(.*?);/)[1], note: note || '' })
}
export const scanSpecies = (dataUrl, note) => {
  const [head, image] = dataUrl.split(',')
  return post('/api/species/scan', { image, media_type: head.match(/data:(.*?);/)[1], note: note || '' })
}
