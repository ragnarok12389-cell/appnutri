import Link from 'next/link';
import { Activity, Apple, ArrowRight, Bot, Camera, CheckCircle2, Dumbbell, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';

const benefits = [
  { icon: Apple, title: 'Alimentação personalizada', text: 'Refeições, porções e substituições alinhadas ao seu perfil e às suas restrições.' },
  { icon: Dumbbell, title: 'Treino organizado', text: 'Sua semana de exercícios com séries, repetições, descanso e registro de cargas.' },
  { icon: TrendingUp, title: 'Evolução visível', text: 'Check-ins e fotos privadas para acompanhar cada fase da sua jornada.' },
  { icon: Bot, title: 'Companhia com IA', text: 'Orientações baseadas nos seus planos oficiais, com limites claros e seguros.' },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const roleHome = user?.profile.role_id === 'patient'
    ? '/patient'
    : user?.profile.role_id === 'admin'
      ? '/admin'
      : '/professional';

  return (
    <div className="flex-1 overflow-hidden">
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div aria-hidden className="absolute left-1/2 top-16 -translate-x-1/2 w-[42rem] h-[24rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-bold text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" /> Sua rotina de saúde em um só lugar
          </div>
          <h1 className="mt-7 text-4xl sm:text-6xl lg:text-7xl font-black tracking-[-0.045em] text-white leading-[1.02]">
            Um plano feito para a sua <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-sky-400">vida real.</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed">
            Dieta, treino, progresso e acompanhamento inteligente conectados ao seu perfil, com privacidade e orientação profissional quando necessário.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
            {user ? (
              <Link href={roleHome} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-black text-zinc-950 hover:bg-emerald-300 transition-colors shadow-xl shadow-emerald-950/50">
                Ir para minha área <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-black text-zinc-950 hover:bg-emerald-300 transition-colors shadow-xl shadow-emerald-950/50">
                  Começar agora <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-colors">Já tenho uma conta</Link>
              </>
            )}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Questionário guiado</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Dados privados</span>
            <span className="inline-flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-emerald-400" /> Evolução por fotos</span>
          </div>
        </div>

        <div className="relative mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-2xl border border-white/10 bg-zinc-900/55 backdrop-blur-sm p-5 hover:-translate-y-1 hover:border-emerald-400/30 transition-all">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-400/10 text-emerald-300 border border-emerald-400/15 group-hover:bg-emerald-400 group-hover:text-zinc-950 transition-colors"><Icon className="w-5 h-5" /></div>
              <h2 className="mt-4 font-bold text-white">{title}</h2>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-16 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-6 sm:p-10 grid md:grid-cols-[1fr_auto] gap-8 items-center overflow-hidden">
          <Activity aria-hidden className="absolute -right-8 -bottom-12 w-56 h-56 text-emerald-400/[0.04]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-400">Acompanhamento contínuo</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white">Seu plano evolui junto com você.</h2>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400 leading-relaxed">Registre sua rotina, converse com a IA e leve sinais importantes para revisão profissional, sem perder o histórico da sua evolução.</p>
          </div>
          <Link href={user ? roleHome : '/register'} className="relative inline-flex items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/10 px-5 py-3 text-sm font-bold text-sky-300 hover:bg-sky-400/20 transition-colors">{user ? 'Continuar no AppNutri' : 'Criar minha conta'} <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </section>
    </div>
  );
}
