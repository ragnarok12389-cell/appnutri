export default function PrivacyPage() {
  return (
    <article className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 text-sm text-zinc-300 leading-relaxed">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Transparência</p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-black text-white">Privacidade no AppNutri</h1>
      <p className="mt-4 text-zinc-400">Versão preliminar para o beta controlado — atualizada em 10 de setembro de 2026.</p>

      <div className="mt-10 space-y-8">
        <section><h2 className="text-lg font-bold text-white">Dados utilizados</h2><p className="mt-2">O AppNutri utiliza dados cadastrais, informações fornecidas nos questionários, registros de alimentação e treino, check-ins, conversas com o assistente e mídias enviadas voluntariamente para oferecer as funções da plataforma.</p></section>
        <section><h2 className="text-lg font-bold text-white">Finalidade</h2><p className="mt-2">Os dados servem para autenticar sua conta, calcular e apresentar planos, acompanhar sua evolução, permitir revisões autorizadas e manter a segurança e a auditoria do serviço.</p></section>
        <section><h2 className="text-lg font-bold text-white">Acesso e compartilhamento</h2><p className="mt-2">O acesso é limitado ao próprio usuário, aos profissionais vinculados conforme suas permissões e aos operadores estritamente necessários. Serviços de infraestrutura e inteligência artificial recebem somente os dados necessários à função solicitada.</p></section>
        <section><h2 className="text-lg font-bold text-white">Fotos e informações de saúde</h2><p className="mt-2">Fotos de evolução ficam em armazenamento privado. Fotos de refeições podem ser processadas pelo provedor de IA para produzir estimativas educativas. O sistema não usa fotos corporais para análise por IA nesta versão.</p></section>
        <section><h2 className="text-lg font-bold text-white">Seus direitos</h2><p className="mt-2">Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade ou eliminação quando aplicável. O canal formal de atendimento e os dados do controlador serão publicados antes da abertura comercial.</p></section>
        <aside className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-100">Este texto precisa de revisão jurídica e inclusão dos dados formais do controlador antes do lançamento público.</aside>
      </div>
    </article>
  );
}
