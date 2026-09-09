# ROADMAP E DECISÕES ARQUITETURAIS — APPNUTRI
## Planejamento das Etapas 9 a 12 e Registro Histórico de Decisões de Engenharia

> **Data de Atualização**: 09 de Setembro de 2026  
> **Finalidade**: Orientar o Codex e a equipe técnica sobre as intenções de produto, etapas futuras e evolução das decisões arquiteturais tomadas durante as Etapas 1 a 8.

---

## 1. PLANEJAMENTO DO ROADMAP (ETAPAS 9 A 12)

Com base estrita nas evidências, prompts de comando e diretrizes deixadas nas etapas anteriores:

### ETAPA 9 — Motor de Feedback, Aderência e Ajuste Contínuo de Planos
- **Status Atual**: 🛑 **NÃO INICIADA / AGUARDANDO PLANEJAMENTO**
- **Fundamentação Identificada no Repositório**:
  - No prompt oficial da Etapa 8, foi determinado:  
    > *"O Companion pode registrar feedback estruturado. Porém não modifica automaticamente o plano nesta Etapa 8. Esses feedbacks serão base importante para a Etapa 9."*
- **Escopo Conhecido e Previsto**:
  - Processamento analítico dos eventos registrados na tabela `public.ai_feedback_events` (`hunger_satiety`, `meal_size`, `taste_dislike`, `exercise_difficulty`, `exercise_discomfort`, `workout_incomplete`, `schedule_issue`).
  - Consolidação de métricas de aderência baseadas em `public.workout_execution_logs` e registros alimentares.
  - Geração de propostas de ajuste ou adaptação de planos para apreciação do profissional responsável (nutricionista / treinador).
  - Regra de Segurança a Preservar: ajustes de prescrição continuam dependendo dos motores determinísticos ou de aprovação profissional; o LLM não decide unilateralmente mudanças no plano.

---

### ETAPA 10 — `[NÃO LOCALIZADO NO REPOSITÓRIO]`
- **Status**: ❓ **A DEFINIR COM O RESPONSÁVEL PELO PRODUTO**
- **Nota de Handoff para o Codex**:  
  Nenhum documento, prompt ou arquivo de especificação no workspace atual contém o título, objetivo ou escopo formal da Etapa 10.  
  *Instrução*: Não inventar escopo. Solicitar definição formal ao responsável pelo produto antes de propor qualquer código ou migração.

---

### ETAPA 11 — `[NÃO LOCALIZADO NO REPOSITÓRIO]`
- **Status**: ❓ **A DEFINIR COM O RESPONSÁVEL PELO PRODUTO**
- **Nota de Handoff para o Codex**:  
  Nenhum documento, prompt ou arquivo de especificação no workspace atual contém o título, objetivo ou escopo formal da Etapa 11.  
  *Instrução*: Não inventar escopo. Solicitar definição formal ao responsável pelo produto antes de propor qualquer código ou migração.

---

### ETAPA 12 — Design Final de Interface, Polimento de UX e Acabamento Visual
- **Status Atual**: 🛑 **NÃO INICIADA / PLANEJADA PARA O FECHAMENTO DO PRODUTO**
- **Fundamentação Identificada no Repositório**:
  - No prompt oficial da Etapa 8, foi determinado:  
    > *"Planejar interface mínima: /patient/assistant com: conversa, respostas contextuais, cards de dieta, cards de treino, opções de substituição, confirmação antes de ações, estados de loading/error, mensagem clara quando ação requer profissional. Design final fica para Etapa 12."*
- **Escopo Conhecido e Previsto**:
  - Padronização visual completa e refinamento de design de ponta a ponta (Design System dark mode).
  - Telas completas de gestão de pacientes para nutricionistas (`/professional/patients`).
  - Painel administrativo e de auditoria (`/admin`).
  - Interação fluida, microinterações, acessibilidade e responsividade mobile para todas as páginas.

---

## 2. REGISTRO DE DECISÕES ARQUITETURAIS CONSOLIDADAS

Para evitar regressões ou discussões já superadas, o Codex deve considerar as seguintes decisões como **definitivas**:

### 2.1. O Princípio da Autoridade Determinística
- **Decisão**: A inteligência artificial (LLM) **NUNCA** é a autoridade clínica ou matemática do software.
- **Racional**: Cálculos de BMR/TDEE/Macros, formulação de cardápios pelo Diet Composer e prescrição biomecânica pelo Workout Engine são problemas matemáticos fechados e determinísticos. O LLM atua apenas na interface conversacional, explicando dados já calculados e coletando feedbacks.

### 2.2. O Princípio `SYMPTOM != DIAGNOSIS`
- **Decisão**: O relato de sintomas pelo paciente (como dor, tontura, palpitação, desânimo) **nunca** é convertido em um diagnóstico médico ou patológico pelo software.
- **Racional**: Proteger a saúde e integridade física do paciente e prevenir exercício ilegal da medicina. Sintomas ativam o status `review_required` ou encaminhamento a atendimento profissional imediato.

### 2.3. Segregação Rígida de Papéis (CRN vs CREF)
- **Decisão**:
  - `nutritionist`: Possui autoridade clínica para prescrever e aprovar planos de dieta (`nutrition.edit`). Não possui autoridade para prescrever ou aprovar treinos (`workout.edit` foi removido).
  - `influencer`: Cria e gerencia programas gerais e comunidades. Não possui autoridade clínica para prescrever dietas (`nutrition.edit` negado) nem aprovar planos com pendências.
  - `patient`: Consome seus próprios dados, registra execuções e interage com o Companion.
  - `admin`: Governança e auditoria.

### 2.4. Two-Phase Commit para Ações do AI Companion
- **Decisão**: O AI Companion **nunca** executa mutações em tabelas de domínio diretamente a partir de um prompt em linguagem natural.
- **Racional**: Prevenir que alucinações do modelo ou ambiguidades de linguagem alterem planos ativos sem consentimento.
- **Implementação**:
  1. O modelo invoca uma ferramenta preparatória (ex: `proposeFoodSubstitution`).
  2. O backend valida a compatibilidade com o motor determinístico e gera um token seguro temporário (`act_...`, TTL 15 minutos).
  3. A interface renderiza um card interativo exigindo o clique explícito do paciente em "Confirmar Troca".
  4. Somente após a confirmação (`applyAuthorizedFoodSubstitution`), a alteração é efetivada.

---

## 3. DECISÕES SUBSTITUÍDAS OU REFINADAS (HISTÓRICO DE EVOLUÇÃO)

Durante as Etapas 1 a 8, algumas decisões iniciais foram aprimoradas para eliminar brechas de segurança ou fragilidades de auditoria:

| Tema | Decisão Inicial (Substituída) | Decisão Vigente Atual (Canônica) | Racional da Mudança |
|---|---|---|---|
| **Checksum do Catálogo de Treino** | Placeholder `'checksum-1.0.0'` em string estática | SHA-256 real de 64 caracteres hexadecimais calculado sobre serialização canônica ordenada (`computeCatalogChecksum`) | Garantir prova criptográfica auditável de que o catálogo de exercícios não foi adulterado. |
| **Janela de Correção de Logs de Treino** | Baseada no campo `logged_at` enviado pelo cliente | Baseada estritamente em `now() <= created_at + INTERVAL '1 hour'`, onde `created_at` é gerado pelo PostgreSQL | Impedir que o usuário forje `logged_at` no futuro para estender indefinidamente a permissão de UPDATE. |
| **Atribuição de Papéis no Cadastro** | Usuário podia enviar `role_id: 'nutritionist'` no payload de registro público | Trigger `handle_new_user` força incondicionalmente o papel `'patient'`. Outros papéis exigem convites tokenizados | Eliminar qualquer possibilidade de autoelevação de privilégios ou evasão de RBAC. |
| **Imutabilidade de Mensagens do Chat** | RLS comum com políticas de SELECT e INSERT | Trigger de banco `trg_ai_message_immutability` bloqueia UPDATE e DELETE em nível de banco de dados | Garantir que o histórico de conversas do AI Companion seja um log auditável e append-only. |
| **Chamada a RPCs Atômicos de Dieta e Treino** | Funções acessíveis com SECURITY DEFINER para `authenticated` | Privilégios revogados de PUBLIC/authenticated e concedidos estritamente a `service_role` com validações no PostgreSQL | Fechar a superfície de ataque de invocação direta de RPC via PostgREST sem validações de aplicação. |

---

## 4. DIRETRIZES DE CONTINUIDADE PARA O CODEX

1. **Não Antecipar Etapas**: Desenvolver uma etapa de cada vez, sempre submetendo `implementation_plan.md` antes de qualquer alteração de código.
2. **Reconciliação Contínua**: A cada etapa, o baseline de testes deve ser conferido e documentado em seu respectivo relatório.
3. **Preservação de Gates**: Sob hipótese alguma contornar testes desabilitando verificações de segurança ou usando mocks que escondam falhas reais.
