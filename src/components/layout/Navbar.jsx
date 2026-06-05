import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { Trophy, Menu, X, Home, Target, Gift, User, Shield, UserPlus, LogIn, Info, HeadphonesIcon, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/hooks/useTheme';

const PUBLIC_LINKS = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/matches', label: 'Partidos', icon: Target },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/prizes', label: 'Premios', icon: Gift },
  { to: '/info', label: 'Información', icon: Info },
  { to: '/support', label: 'Soporte', icon: HeadphonesIcon },
];

const navVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

const linkVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.05, duration: 0.2 } }),
};

export default function Navbar({ user }) {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  const authLinks = user ? [
    { to: '/profile', label: 'Mi Perfil', icon: User },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
  ] : [];

  const links = [...PUBLIC_LINKS, ...authLinks];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="ChessKing"
              className="h-10 w-auto"
            />
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link key={l.to} to={l.to}>
                <m.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    variant={isActive(l.to) ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-1.5 text-sm relative"
                  >
                    <l.icon className="w-4 h-4" />
                    {l.label}
                    {isActive(l.to) && (
                      <m.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-md bg-primary/10 -z-10"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Button>
                </m.div>
              </Link>
            ))}

            {/* Theme toggle */}
            <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1"
                onClick={toggleTheme}
                role="switch"
                aria-checked={theme === 'dark'}
                aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </m.div>

            {user ? (
              <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 text-muted-foreground"
                  onClick={() => logout()}
                >
                  Salir
                </Button>
              </m.div>
            ) : (
              <div className="flex items-center gap-1 ml-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <LogIn className="w-4 h-4" />
                    Ingresar
                  </Button>
                </Link>
                <Link to="/register">
                  <m.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                    <Button size="sm" className="gap-1.5 glow-sm">
                      <UserPlus className="w-4 h-4" />
                      Crear cuenta
                    </Button>
                  </m.div>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <m.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" onClick={toggleTheme} role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </m.div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {open && (
            <m.div
              variants={navVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="md:hidden overflow-hidden"
            >
              <div className="pb-4 space-y-1">
                {links.map((l, i) => (
                  <m.div
                    key={l.to}
                    custom={i}
                    variants={linkVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Link to={l.to} onClick={() => setOpen(false)}>
                      <Button
                        variant={isActive(l.to) ? 'default' : 'ghost'}
                        className="w-full justify-start gap-2"
                        size="sm"
                      >
                        <l.icon className="w-4 h-4" />
                        {l.label}
                      </Button>
                    </Link>
                  </m.div>
                ))}
                {user ? (
                  <m.div
                    custom={links.length}
                    variants={linkVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => logout()}
                    >
                      Salir
                    </Button>
                  </m.div>
                ) : (
                  <>
                    <m.div
                      custom={links.length}
                      variants={linkVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Link to="/login" onClick={() => setOpen(false)}>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                          <LogIn className="w-4 h-4" />
                          Ingresar
                        </Button>
                      </Link>
                    </m.div>
                    <m.div
                      custom={links.length + 1}
                      variants={linkVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Link to="/register" onClick={() => setOpen(false)}>
                        <Button size="sm" className="w-full justify-start gap-2">
                          <UserPlus className="w-4 h-4" />
                          Crear cuenta
                        </Button>
                      </Link>
                    </m.div>
                  </>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
