import React from 'react'
import ReactDOM from 'react-dom/client'
import { LazyMotion, domAnimation } from 'framer-motion'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <LazyMotion features={domAnimation}>
    <App />
  </LazyMotion>
)
