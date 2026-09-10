# AppNutri — Production Gate

**Data:** 10 de setembro de 2026  
**Status:** PASS técnico local e Supabase hospedado / publicação pendente  
**Baseline:** 463 testes em 50 arquivos

## Aprovado

- gate sequencial reproduzível por `npm run gate`;
- 463 testes, TypeScript, ESLint e build de produção aprovados;
- 29 rotas geradas no Next.js 16;
- healthcheck público sem cache e sem segredos em `/api/health`;
- cabeçalhos globais contra sniffing, framing e permissões indevidas;
- identificação do framework removida dos headers;
- rotas de privacidade e termos disponíveis sem autenticação;
- erros inesperados do AI Companion sanitizados;
- análise visual de refeições limitada a dez solicitações por paciente por hora;
- `.env.local` ignorado e nenhuma credencial real encontrada em arquivos versionados;
- verificador de variáveis de produção sem impressão de valores;
- auditoria automatizada do Supabase hospedado.

## Supabase hospedado

O comando `npm run audit:hosted` confirmou:

- 64 tabelas esperadas acessíveis pelo backend;
- nenhuma linha das tabelas sensíveis exposta ao papel anônimo;
- RPCs de persistência privilegiada negadas ao papel anônimo;
- bucket `patient-media` existente e privado.

## Dependências externas para publicação

1. Definir o domínio HTTPS definitivo e atualizar `NEXT_PUBLIC_SITE_URL`.
2. Cadastrar domínio e callback nas configurações de Auth do Supabase.
3. Fazer revisão jurídica e preencher controlador, canal de atendimento e foro nos textos preliminares.
4. Escolher a conta/projeto de hospedagem e configurar os segredos nela.
5. Publicar preview e executar teste de aceitação nos fluxos completos.
6. Configurar monitoramento externo do endpoint `/api/health` e política de backups.

`npm run check:production-env` falha intencionalmente enquanto o endereço continuar em localhost. Nenhuma outra variável obrigatória apresentou ausência ou placeholder no ambiente atual.

## Comandos

```bash
npm run check:production-env
npm run audit:hosted
npm run gate
```

**PRODUCTION READINESS (LOCAL + HOSTED DATA SECURITY): PASS**  
**PUBLIC RELEASE: AGUARDANDO DOMÍNIO, HOSPEDAGEM E REVISÃO JURÍDICA**
