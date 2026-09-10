export default function TermsPage() {
  return (
    <article className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 text-sm text-zinc-300 leading-relaxed">
      <p className="text-xs font-bold uppercase tracking-widest text-sky-400">Uso responsável</p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-black text-white">Termos de uso</h1>
      <p className="mt-4 text-zinc-400">Versão preliminar para o beta controlado — atualizada em 10 de setembro de 2026.</p>

      <div className="mt-10 space-y-8">
        <section><h2 className="text-lg font-bold text-white">Finalidade da plataforma</h2><p className="mt-2">O AppNutri organiza informações, planos, registros e acompanhamento relacionados à alimentação e ao treinamento. O serviço não substitui atendimento médico, diagnóstico ou cuidado de emergência.</p></section>
        <section><h2 className="text-lg font-bold text-white">Planos e acompanhamento</h2><p className="mt-2">Cálculos automáticos seguem motores determinísticos e limites de segurança. Situações que exigem avaliação são encaminhadas para revisão profissional. O assistente de IA explica informações e coleta feedback, mas não altera prescrições sem autorização.</p></section>
        <section><h2 className="text-lg font-bold text-white">Responsabilidades do usuário</h2><p className="mt-2">O usuário deve fornecer informações corretas, proteger sua senha, respeitar suas limitações e procurar atendimento qualificado diante de dor, sintomas, alergias, emergência ou qualquer dúvida clínica.</p></section>
        <section><h2 className="text-lg font-bold text-white">Conteúdo e disponibilidade</h2><p className="mt-2">Estimativas visuais de refeições podem variar conforme porções, ingredientes e preparo. Durante o beta, funções podem ser corrigidas ou temporariamente indisponibilizadas para preservar segurança e integridade dos dados.</p></section>
        <section><h2 className="text-lg font-bold text-white">Conta e encerramento</h2><p className="mt-2">O acesso pode ser suspenso em caso de fraude, abuso ou risco à plataforma. As regras comerciais de cancelamento, cobrança e reembolso serão incluídas quando as assinaturas forem ativadas.</p></section>
        <aside className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-100">Este texto precisa de revisão jurídica, identificação da empresa e definição de foro antes do lançamento público.</aside>
      </div>
    </article>
  );
}
