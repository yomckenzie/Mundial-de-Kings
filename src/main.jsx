import React from 'react'
import ReactDOM from 'react-dom/client'
import { LazyMotion, domAnimation } from 'framer-motion'
import App from '@/App.jsx'
import '@/index.css'

// Silenciar solo console.log (output de desarrollo), conservar errores y warnings
// Activar logs completos con: localStorage.setItem('chessking-debug', '1') y recargar.
if (!localStorage.getItem('chessking-debug')) {
  const noop = () => {}
  const methods = ['log', 'info', 'debug', 'trace', 'table', 'group', 'groupEnd', 'groupCollapsed', 'time', 'timeEnd', 'timeLog', 'count', 'countReset', 'assert', 'dir', 'dirxml', 'profile', 'profileEnd']
  methods.forEach((m) => {
    try { console[m] = noop } catch { /* ignore */ }
  })
  // console.warn y console.error se conservan — son esenciales para depurar
  window.onerror = () => true
  window.addEventListener('unhandledrejection', (e) => { e.preventDefault() })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <LazyMotion features={domAnimation}>
    <App />
  </LazyMotion>
)
