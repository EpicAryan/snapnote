import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-6 text-lg">snapnote popup</div>
  </StrictMode>,
)
