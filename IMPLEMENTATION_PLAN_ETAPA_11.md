# ETAPA 11 — Experiência integrada, mídia e acompanhamento com IA

## Objetivo

Fechar a jornada do paciente entre o questionário de oito etapas, a liberação de dieta e treino e o acompanhamento contínuo.

## Entregas

1. Estados claros de bloqueio, geração, revisão e disponibilidade para dieta e treino.
2. Orquestração segura após a conclusão do perfil, sem ultrapassar os gates clínicos.
3. Fotos corporais privadas nos marcos `start`, `midpoint` e `goal`.
4. Foto de refeição com análise visual educativa, incerteza explícita e histórico.
5. AI Companion integrado ao acompanhamento e aos planos oficiais do paciente.
6. Exclusão de mídia pelo paciente e auditoria de criação, análise e exclusão.

## Limites

- Fotos ficam em bucket privado e nunca usam URL pública permanente.
- Um paciente não acessa a mídia de outro paciente.
- Fotos corporais não são submetidas à IA nesta versão.
- A foto de prato produz estimativas, não medições, diagnóstico ou prescrição.
- A IA não altera dieta ou treino sem o fluxo de confirmação e autorização já existente.
- Casos clínicos continuam sujeitos à revisão de profissional habilitado.

## Estado atual

A fundação de mídia e visão foi entregue na migração 21, com interface em `/patient/progress`. A integração automática do questionário com dieta e treino permanece como próximo bloco da Etapa 11.
