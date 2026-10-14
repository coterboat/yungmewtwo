import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './app/App.tsx'
import './index.css'
import { applyTheme } from './lib/prefs.ts'

applyTheme()

// Android "Share to yungmewtwo" (manifest share_target) lands on ./?share_url=…; turn it into a
// prefilled board post. Shared text often carries the link when the url field is empty.
const shared = new URLSearchParams(location.search)
if (shared.has('share_url') || shared.has('share_text')) {
  const text = shared.get('share_text') ?? ''
  const url = shared.get('share_url') || text.match(/https?:\/\/\S+/)?.[0] || ''
  const title = shared.get('share_title') || text.replace(url, '').trim()
  const q = new URLSearchParams({ new: 'deal', ...(url && { url }), ...(title && { title }) })
  history.replaceState(null, '', `${location.pathname}#/board?${q}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
