import React from 'react'
import ReactDOM from 'react-dom/client'
import { LazyMotion, domAnimation } from 'framer-motion'
import App from '@/App.jsx'
import '@/index.css'

// Silenciar toda la salida de consola (log/info/warn/error/debug/trace/table/group).
// Activar con: localStorage.setItem('chessking-debug', '1') y recargar.
if (!localStorage.getItem('chessking-debug')) {
  const noop = () => {}
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'group', 'groupEnd', 'groupCollapsed', 'time', 'timeEnd', 'timeLog', 'count', 'countReset', 'assert', 'dir', 'dirxml', 'profile', 'profileEnd']
  methods.forEach((m) => {
    try { console[m] = noop } catch { /* ignore */ }
  })
  // console.error de React se maneja por separado; silenciar warnings de Radix
  // se hace vía DialogDescription (ya agregado). Conservar throw real:
  window.onerror = () => true
  window.addEventListener('unhandledrejection', (e) => { e.preventDefault() })
  // Suprimir console.error en promesas de fetch fallidas (sync Supabase)
  const origError = console.error
  // (noop ya está aplicado arriba)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <LazyMotion features={domAnimation}>
    <App />
  </LazyMotion>
)
