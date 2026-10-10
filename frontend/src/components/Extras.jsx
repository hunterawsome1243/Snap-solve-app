import { useState } from 'react'
import { dayTotals, mealsOn } from '../lib/food.js'
import { dueCount } from '../lib/plants.js'
import * as store from '../storage.js'
import FoodScan from './FoodScan.jsx'
import Icon from './Icon.jsx'
import PlantScan from './PlantScan.jsx'
import SpeciesScan from './SpeciesScan.jsx'

// A home for extra tools beyond solving and shopping. Each one is a card; pick one to open it.
export default function Extras() {
  const [tool, setTool] = useState(null)
  const back = () => setTool(null)
  if (tool === 'plants') return <PlantScan onBack={back} />
  if (tool === 'food') return <FoodScan onBack={back} />
  if (tool === 'species') return <SpeciesScan onBack={back} />
  const plants = store.loadPlants()
  const due = dueCount(plants)
  const today = mealsOn(store.loadMeals())
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
      <button className="card tool" onClick={() => setTool('food')}>
        <span className="tool-ico"><Icon name="food" /></span>
        <span className="tool-text">
          <b>Food Scan</b>
          <span className="muted">Estimate calories and nutrients from a meal or a label.</span>
          {today.length > 0 && <span className="due">{dayTotals(today).calories} cal today</span>}
        </span>
      </button>
      <button className="card tool" onClick={() => setTool('species')}>
        <span className="tool-ico"><Icon name="paw" /></span>
        <span className="tool-text">
          <b>Species Scan</b>
          <span className="muted">Identify an animal, bird, insect, fish or fungus.</span>
        </span>
      </button>
      <p className="muted tiny center-text">More tools are on the way.</p>
    </div>
  )
}
