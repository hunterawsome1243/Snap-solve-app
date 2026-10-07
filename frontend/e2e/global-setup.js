import fs from 'node:fs'
import path from 'node:path'
import bwipjs from 'bwip-js'
import { encodePng, encodeY4m, paperFrame } from './support/synthetic.js'

export const TMP = path.resolve('e2e/.tmp')

export default async function globalSetup() {
  fs.mkdirSync(TMP, { recursive: true })
  const frame = paperFrame()
  fs.writeFileSync(path.join(TMP, 'paper.png'), encodePng(frame))
  fs.writeFileSync(path.join(TMP, 'paper.y4m'), encodeY4m(frame))
  fs.writeFileSync(path.join(TMP, 'ean.png'), await bwipjs.toBuffer({ bcid: 'ean13', text: '590123412345', scale: 4, height: 18, includetext: true, paddingwidth: 20, paddingheight: 20, backgroundcolor: 'FFFFFF' }))
}
