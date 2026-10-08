import { useState } from 'react'
import { dueCount } from '../lib/plants.js'
import * as store from '../storage.js'
import Icon from './Icon.jsx'
import PlantScan from './PlantScan.jsx'

// A home for extra tools beyond solving and shopping. Each one is a card; pick one to open it.
export default function Extras() {
  const [tool, setTool] = useState(null)
  if (tool === 'plants') return <PlantScan onBack={() => setTool(null)} />
  const plants = store.loadPlants()
  const due = dueCount(plants)
  return (
    <div className="stack">
      <div>
        <h1>Extras</h1>
        <p className="muted">More ways to use the camera.</p>
      </div>
      <button className="card tool" onClick={() => setTool('plants')}>
        <span className="tool-ico"><Icon name="leaf" /></span>
        <span className="tool-text">
          <b>Plant Scan</b>
          <span className="muted">Identify a plant, check its health and get care tips.</span>
          {plants.length > 0 && <span className={`due ${due ? 'now' : ''}`}>{due ? `${due} need${due === 1 ? 's' : ''} water` : `${plants.length} saved plant${plants.length === 1 ? '' : 's'}`}</span>}
        </span>
      </button>
      <p className="muted tiny center-text">More tools are on the way.</p>
    </div>
  )
}
