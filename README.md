# AppNutri

Plataforma de alimentação, treino e acompanhamento com motores determinísticos, isolamento multi-tenant no Supabase e assistência contextual por IA.

## Requisitos

- Node.js compatível com Next.js 16;
- projeto Supabase com as migrations de `supabase/migrations` aplicadas;
- credenciais indicadas em `.env.example`;
- chave Gemini para Companion e análise visual de refeições.

## Desenvolvimento

```bash
npm install
copy .env.example .env.local
npm run dev
```

O exemplo de ambiente contém apenas placeholders. Nunca versione `.env.local` ou chaves reais.

## Gates obrigatórios

```bash
npm run gate
```

Esse comando executa testes, TypeScript, ESLint e build em sequência. A execução sequencial evita contenção no teste combinatório do motor nutricional.

Antes de publicar, carregue as variáveis do ambiente de produção e execute:

```bash
npm run check:production-env
npm run audit:hosted
```

O validador não imprime os valores das credenciais.

## Rotas operacionais

- `GET /api/health`: liveness sem consulta a dados ou exposição de segredos;
- `/privacy`: aviso preliminar de privacidade;
- `/terms`: termos preliminares de uso.

## Publicação

1. Aplicar todas as migrations no projeto Supabase de destino na ordem dos nomes.
2. Configurar as cinco variáveis obrigatórias listadas em `.env.example`.
3. Ajustar `NEXT_PUBLIC_SITE_URL` para o domínio HTTPS definitivo.
4. Cadastrar o domínio nas URLs permitidas do Supabase Auth.
5. Executar `npm run check:production-env` e `npm run gate`.
6. Publicar uma versão de preview e validar cadastro, login, questionário, dieta, treino, progresso, fotos e IA.
7. Obter revisão jurídica dos textos preliminares antes da abertura pública.

## Documentação técnica

- `APPNUTRI_HANDOFF.md`: arquitetura e decisões herdadas;
- `REVISAO_ETAPA_12_COMPLETA.md`: gate final do roadmap;
- `supabase/migrations`: histórico canônico do banco e das políticas RLS.
