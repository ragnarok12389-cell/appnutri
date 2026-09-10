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

A fundação de mídia e visão foi entregue na migração 21, com interface em `/patient/progress`.

A ativação automática foi entregue na migração 22 e no serviço `plan-activation`: ao concluir a etapa 8, o backend cria uma nova versão imutável do perfil, executa o motor nutricional, compõe a dieta e monta o treino com os equipamentos declarados. O resultado por versão fica persistido para o painel distinguir processamento, revisão, configuração necessária e falha. Perfis concluídos antes da migração recebem uma chamada clara para revisar e gerar os planos.

O código da Etapa 11 está concluído. A análise real de fotos de refeições depende apenas da configuração externa de `GEMINI_API_KEY`; sem a chave, o endpoint permanece indisponível de forma explícita e não fabrica resultados.
