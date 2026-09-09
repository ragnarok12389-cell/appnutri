# Plano de fechamento técnico da Etapa 8

## Estado de entrada

- Baseline confirmado em 9 de setembro de 2026: 423 testes em 44 arquivos.
- TypeScript, ESLint e build Next.js com 23 páginas e rotas concluíram com código zero.
- Commit local de referência anterior ao hardening: `d1adf9f`.
- A Etapa 9 permanece fora deste pacote de trabalho.

## Problemas comprovados no código real

1. A rota de chat aceita `conversation_id` sem comprovar que a conversa pertence ao usuário autenticado, enquanto usa `service_role` para ler e gravar.
2. O adaptador do Companion consulta colunas que não existem em `patient_nutrition_profiles` e ignora erros do Supabase, resultando em contexto genérico silencioso.
3. A busca de item alimentar usa somente `food_id`, sem plano, refeição ou paciente, permitindo selecionar um snapshot de outro tenant.
4. O catálogo usa a tabela inexistente `food_items`, embora o schema canônico use `foods` e `food_nutrients`.
5. As restrições de dieta e treino são parcialmente preenchidas com valores fixos. Isso pode apresentar uma substituição como segura sem evidência suficiente.
6. O rate limiter é recriado em memória a cada request, apesar de existir a tabela `ai_rate_limits`.
7. A confirmação de troca atual atualiza `diet_meal_items` diretamente com `service_role`, contornando a imutabilidade e sem criar a nova versão exigida pelo contrato do Diet Composer.
8. A leitura e a atualização do token de confirmação não são atômicas, permitindo corrida entre confirmações simultâneas.
9. A chamada ao provedor não aplica o timeout declarado e o ambiente sem chave cai silenciosamente no provider simulado.

## Mudanças autorizadas neste fechamento

### Segurança de tenant

- Validar conversa por `id` e `patient_id` antes de construir contexto ou persistir mensagens.
- Escopar histórico, plano, refeição e item ao paciente autenticado mesmo quando a consulta usa `service_role`.
- Falhar de forma explícita quando consultas de segurança ou domínio retornarem erro.

### Contexto e motores determinísticos

- Ler os nomes de colunas reais do perfil e buscar alergias na tabela sensível segregada.
- Usar `nutrition_targets.constraints_data` como snapshot autoritativo das restrições de dieta.
- Carregar o catálogo pela estrutura real `foods` mais nutrientes e tags.
- Bloquear substituição de exercício enquanto não existir snapshot persistido das restrições de treino; ausência de dados não será tratada como segurança.

### Confirmação e imutabilidade

- Incluir no token os IDs reais de plano, refeição e item já validados.
- Reivindicar o token atomicamente no PostgreSQL antes da mutação.
- Aplicar a substituição pelo fluxo versionado existente, que clona o plano, recalcula totais e hash, persiste via `persist_diet_plan_atomic` e supersede a versão anterior.
- Registrar sucesso ou falha no mesmo registro de auditoria da ferramenta.

### Rate limiting e provider

- Consumir o limite em operação atômica persistida em `ai_rate_limits`.
- Usar o armazenamento em memória somente em testes unitários.
- Aplicar timeout real à chamada do provider e falhar fechado quando a chave não estiver configurada fora de testes.

## Verificação obrigatória

- Testes negativos para conversa cross-tenant, item cross-tenant, token concorrente e ausência de restrições de treino.
- Testes da migration adicional, incluindo privilégios restritos a `service_role`.
- Suíte global, TypeScript, ESLint e build com código zero.
- Relatório final com baseline reconciliado e riscos restantes para homologação no Supabase real.

