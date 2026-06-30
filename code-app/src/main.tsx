import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Intaglio type system — self-hosted via @fontsource (bundled by Vite, no CDN).
// Display: Fraunces (variable). UI: IBM Plex Sans. Data: IBM Plex Mono.
import '@fontsource-variable/fraunces/index.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
