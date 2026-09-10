import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> AppNutri — seus dados, sua jornada.</span>
        <nav aria-label="Links legais" className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacidade</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Termos de uso</Link>
        </nav>
      </div>
    </footer>
  );
}
