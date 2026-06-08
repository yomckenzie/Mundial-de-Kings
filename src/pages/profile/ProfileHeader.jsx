import { m } from 'framer-motion';
import { User } from 'lucide-react';

export default function ProfileHeader({ user }) {
  return (
    <m.div variants={itemVariants}>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
          <User className="w-6 h-6 text-background" />
        </div>
        <div>
          <h1 className="font-display text-4xl tracking-wide">{user?.full_name?.split(' ')[0] || 'Perfil'}</h1>
          <p className="text-sm text-muted-foreground">@{user?.instagram || user?.email}</p>
        </div>
      </div>
    </m.div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
};
