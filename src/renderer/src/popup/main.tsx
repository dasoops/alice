import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { layoutOf } from './lib/layout'
import type { PopupInit } from '../../../main/popup/types'

const root = document.getElementById('popup') as HTMLElement
const reactRoot = createRoot(root)

window.popup.ready((init: PopupInit) => {
  root.className = `mode-${layoutOf(init.mode)}`
  reactRoot.render(<App init={init} />)
})
