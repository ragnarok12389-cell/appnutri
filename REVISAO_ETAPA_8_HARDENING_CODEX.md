# Revisão técnica e hardening da Etapa 8 — AI Companion

**Data:** 9 de setembro de 2026  
**Responsável:** Codex  
**Escopo:** auditoria e correção do runtime entregue na Etapa 8  
**Resultado:** PASS local, com homologação em Supabase real ainda pendente

## Baseline reconciliado

O baseline de 386 testes pertence ao encerramento histórico da Etapa 7. O pacote recebido após a Etapa 8 tinha 423 testes em 44 arquivos. Este hardening adicionou três verificações de segurança e encerrou com:

- 426 testes aprovados em 44 arquivos;
- TypeScript sem erros;
- ESLint sem erros ou avisos;
- build Next.js 16.3.4 concluído, com 23 páginas e rotas geradas;
- 18 migrations SQL versionadas.

O commit local anterior às correções é `d1adf9f` (`chore: establish post-stage-8 baseline`).

## Falhas encontradas no runtime recebido

1. Uma conversa podia ser informada por ID sem comprovação de pertencimento ao paciente autenticado, enquanto a rota operava com `service_role`.
2. O construtor de contexto consultava colunas e uma tabela de catálogo inexistentes, ignorava erros e podia fornecer contexto genérico silencioso ao modelo.
3. A leitura de um item alimentar era feita somente pelo `food_id`, sem vínculo obrigatório com paciente, plano e refeição.
4. Restrições de dieta e movimento eram completadas com valores fixos, permitindo que ausência de evidência fosse interpretada como segurança.
5. O limite de mensagens era armazenado em uma instância nova em memória a cada requisição.
6. A confirmação alterava diretamente o item de dieta com `service_role`, contornando o contrato imutável e versionado do Diet Composer.
7. A confirmação não reivindicava o token de forma atômica e estava sujeita a execução concorrente.
8. O provider não aplicava o timeout configurado, expunha a chave na URL e adotava silenciosamente o provider simulado quando a chave estava ausente.

## Correções aplicadas

### Isolamento multi-tenant

- As rotas de chat e confirmação validam a conversa por `id` e `patient_id` antes de ler ou gravar.
- Histórico, plano ativo, refeição, item e alimento são encadeados até o paciente autenticado, inclusive em consultas administrativas.
- Erros de consultas relevantes para autorização, persistência e auditoria agora interrompem o fluxo.

### Contexto determinístico

- O perfil usa as colunas reais de `profiles` e `patient_nutrition_profiles`.
- Alergias e restrições clínicas vêm de `patient_nutrition_sensitive`.
- Restrições alimentares vêm do snapshot autoritativo em `nutrition_targets.constraints_data`.
- O catálogo usa `foods`, `food_nutrients`, tags e medidas.
- Substituições de exercício falham de forma segura enquanto não houver snapshot persistido das restrições de movimento. A Etapa 7 armazena o hash, mas não o conteúdo necessário para uma nova validação.

### Confirmação, versionamento e auditoria

- A migration `20260909000018_ai_companion_runtime_hardening.sql` adiciona estados e RPCs para consumir limite, reivindicar, concluir e cancelar ações.
- A reivindicação bloqueia a linha, valida paciente, expiração, estado e a cadeia plano/refeição/item antes de permitir a mutação.
- As RPCs revogam acesso de `PUBLIC`, `anon` e `authenticated` e concedem execução somente ao `service_role`.
- A substituição confirmada usa o fluxo determinístico já existente: clona o plano, substitui o item, recalcula os totais e o hash, persiste atomicamente e supersede a versão anterior.
- O retorno identifica `new_plan_id`, refletindo corretamente o artefato criado.

### Limites e provider

- O limite é consumido atomicamente na tabela `ai_rate_limits`; memória fica restrita aos testes unitários.
- O Gemini recebe a chave no cabeçalho, respeita timeout real e devolve erro sanitizado.
- Fora de testes, a ausência de `GEMINI_API_KEY` falha explicitamente e não ativa o provider simulado.

## Evidência dos gates

| Gate | Resultado |
|---|---|
| `npm test` | 44 arquivos, 426 testes aprovados, exit code 0 |
| `npx tsc --noEmit` | 0 erros, exit code 0 |
| `npm run lint` | 0 erros, 0 avisos, exit code 0 |
| `npm run build` | compilação aprovada e 23 páginas/rotas geradas, exit code 0 |
| `git diff --check` | nenhuma inconsistência de whitespace |

## Riscos e validações pendentes

1. Aplicar as 18 migrations em um projeto Supabase de homologação e repetir os casos com Auth/JWT/PostgREST reais. Os testes atuais exercitam o SQL em PGlite e a lógica TypeScript local.
2. Validar no PostgreSQL gerenciado o uso histórico de `timezone('utc', now())` em colunas `TIMESTAMPTZ`.
3. Persistir um snapshot canônico das restrições de movimento antes de reativar substituições de exercício no AI Companion.
4. Auditar as Server Actions anteriores à Etapa 8 que combinam `service_role` e permissão profissional, comprovando vínculo profissional-paciente ativo em cada operação.
5. Migrar a convenção `middleware` para `proxy` conforme o Next.js 16. O build permanece funcional e emite apenas o aviso de descontinuação.
6. Validar credenciais, modelo configurado, timeout e respostas reais do Gemini no ambiente de homologação.
7. Não há remoto Git configurado; os commits existem somente neste checkout local até a definição do repositório de destino.

## Decisão de gate

A Etapa 8 fica tecnicamente aceita no ambiente local com baseline de **426 testes**. A Etapa 9 não foi iniciada. A entrada nela depende de plano próprio e deve manter bloqueadas alterações nos motores determinísticos, migrations históricas, RLS e contratos públicos sem justificativa, testes e revisão explícita.
