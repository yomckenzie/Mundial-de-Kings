import { Link } from 'react-router-dom';
import { m } from 'framer-motion';

export default function RegisterHeader() {
  return (
    <m.div
      className="text-center mb-8 space-y-2"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
    >
      <m.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
      >
        <Link to="/" className="inline-block">
          <img
            src="/logo.svg"
            alt="ChessKing"
            className="h-16 sm:h-20 md:h-24 w-auto mx-auto mb-3 drop-shadow-lg transition-transform duration-300 hover:scale-105 cursor-pointer"
          />
        </Link>
      </m.div>
      <h1 className="font-display text-4xl md:text-5xl tracking-wide">
        MUNDIAL DE{' '}
        <span className="text-foreground">KINGS</span>
      </h1>
      <p className="text-muted-foreground">Crea tu cuenta y empieza a pronosticar</p>
    </m.div>
  );
}
