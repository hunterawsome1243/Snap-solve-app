import { useState } from 'react'
import { dayTotals, mealsOn } from '../lib/food.js'
import { SCANNERS, toggleFav } from '../lib/favorites.js'
import { dueCount } from '../lib/plants.js'
import * as store from '../storage.js'
import FoodScan from './FoodScan.jsx'
import Icon from './Icon.jsx'
import PlantScan from './PlantScan.jsx'
import SpeciesScan from './SpeciesScan.jsx'

// Every scanner lives here. The star pins a scanner to one of the two favourite slots in the bottom bar.
export default function Extras({ tool, setTool, favs, setFavs, onOpen }) {
  const [note, setNote] = useState('')
  const back = () => setTool(null)
  if (tool === 'plants') return <PlantScan onBack={back} />
  if (tool === 'food') return <FoodScan onBack={back} />
  if (tool === 'species') return <SpeciesScan onBack={back} />

  const plants = store.loadPlants()
  const due = dueCount(plants)
  const today = mealsOn(store.loadMeals())
  const badge = {
    plants: plants.length > 0 && <span className={`due ${due ? 'now' : ''}`}>{due ? `${due} need${due === 1 ? 's' : ''} water` : `${plants.length} saved plant${plants.length === 1 ? '' : 's'}`}</span>,
    food: today.length > 0 && <span className="due">{dayTotals(today).calories} cal today</span>,
  }

  function star(sc) {
    const { favs: next, dropped } = toggleFav(favs, sc.id)
    setFavs(next)
    const name = (id) => SCANNERS.find((x) => x.id === id).title
    setNote(next.includes(sc.id) ? `${sc.title} is pinned to the bottom bar.${dropped ? ` ${name(dropped)} was replaced.` : ''}` : `${sc.title} was removed from the bottom bar.`)
  }

  return (
    <div className="stack">
      <div>
        <h1>Extras</h1>
        <p className="muted">All your scanners. Tap the star to pin up to two to the bottom bar.</p>
      </div>
      {SCANNERS.map((sc) => {
        const on = favs.includes(sc.id)
        return (
          <div key={sc.id} className="card tool">
            <button className="tool-main" onClick={() => onOpen(sc.id)}>
              <span className="tool-ico"><Icon name={sc.icon} /></span>
              <span className="tool-text">
                <b>{sc.title}</b>
                <span className="muted">{sc.blurb}</span>
                {badge[sc.id]}
              </span>
            </button>
            <button className={`star ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${sc.title} ${on ? 'from' : 'to'} favorites`} onClick={() => star(sc)}>
              <Icon name="star" />
            </button>
          </div>
        )
      })}
      <p className="muted tiny center-text" role="status">{note || 'More tools are on the way.'}</p>
    </div>
  )
}
