import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'AppNutri | Nutrição e treino em um só lugar',
    template: '%s | AppNutri',
  },
  description: 'Planos personalizados de alimentação e treino, acompanhamento de progresso e orientação com IA.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark bg-zinc-950 text-zinc-100">
      <body className="min-h-screen flex flex-col text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-200">
        <a href="#conteudo-principal" className="skip-link">Pular para o conteúdo</a>
        <Navbar />
        <main id="conteudo-principal" className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
