import React from 'react';
import { UserRole, ROLE_LABELS } from '@/types/roles';

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const styles: Record<UserRole, string> = {
    admin: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    nutritionist: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    influencer: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    patient: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide border ${styles[role] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'} ${className}`}
    >
      {ROLE_LABELS[role] || role}
    </span>
  );
}
