# Governança de Fontes de Dados de Alimentos (Food Data Sources Registry)

Este documento registra formalmente a proveniência, licenciamento, versão, integridade, semântica analítica e governança de segurança da base estruturada de alimentos do sistema.

---

## 1. Fonte Primária Oficial: TACO (Tabela Brasileira de Composição de Alimentos)

- **Entidade Publicadora**: Núcleo de Estudos e Pesquisas em Alimentação (NEPA) — Universidade Estadual de Campinas (UNICAMP).
- **Domínio Oficial de Origem**: `nepa.unicamp.br`
- **URL Oficial de Download**: `https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/`
- **Versão Adotada**: 4ª edição revisada e ampliada (2011).
- **Arquivo Raw Oficial Canônico**: `src/data/taco/raw/taco_nepa_oficial.xlsx`
- **Nome Real na Plataforma Oficial**: `taco_4a_edicao.xlsx` (MIME: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- **Tamanho do Arquivo Oficial**: `322.270` bytes (322,27 KB)
- **Checksum SHA-256 Oficial Canônico**: `A66B8EC528DAEABC63BC2B015FC9BD8C6D76B941C2FC0ED93A4311D449302D14`
- **Versões de Processamento**:
  - `parser_version`: `2.0.0`
  - `normalization_version`: `2.0.0`
  - `import_run_id`: `canonical_nepa_import_20260908`
- **Coordenadora do Projeto**: Profa. Dra. Elisabete Salay / Profa. Dra. Lilian R. B. Mariath / Prof. Dr. Jaime Amaya-Farfan.
- **Referência Bibliográfica**:
  NEPA-UNICAMP. *Tabela brasileira de composição de alimentos - TACO*. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. 161 p.
- **Identificador no Sistema (`food_data_sources`)**:
  - `name`: `TACO`
  - `version`: `4.0.0`
  - `publisher`: `NEPA/UNICAMP`
  - `domain`: `nepa.unicamp.br`
  - `reference`: `Tabela Brasileira de Composição de Alimentos, 4ª edição revisada e ampliada, 2011.`
  - `checksum`: `A66B8EC528DAEABC63BC2B015FC9BD8C6D76B941C2FC0ED93A4311D449302D14`
  - `license_notes`: `Dados públicos para uso em pesquisa e aplicações em saúde e nutrição no Brasil. Preservada a atribuição e citação obrigatória aos autores e à UNICAMP.`

### Prova de que Nenhum Dado Canônico Depende de Mirrors
1. O arquivo `taco_composicao.csv` de terceiros e repositórios GitHub foi expressamente e definitivamente removido do repositório.
2. O parser canônico ([`scripts/parse_taco_excel.py`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/scripts/parse_taco_excel.py)) consome exclusivamente `src/data/taco/raw/taco_nepa_oficial.xlsx`.
3. Antes de iniciar qualquer extração, o script valida a existência física do arquivo e calcula seu hash SHA-256 em tempo real. Se o arquivo estiver ausente ou o hash for diferente de `A66B8EC528DAEABC63BC2B015FC9BD8C6D76B941C2FC0ED93A4311D449302D14`, a execução é abortada com erro fatal.
4. Todos os 597 nomes de alimentos, grupos alimentares canônicos e teores analíticos de 27 nutrientes são lidos das abas oficiais `CMVCol taco3` e `AGtaco3` da planilha do NEPA, sem qualquer dependência externa.
5. Reconciliação canônica intra-arquivo: o alimento 540 apresenta o caractere `'L'` na aba `CMVCol taco3` devido a um erro tipográfico da planilha original da UNICAMP, sendo reconciliado para `'Feijoada'` a partir da aba `AGtaco3` do mesmo arquivo Excel oficial (e validado com a publicação oficial em PDF).

---

## 2. Semântica Oficial e Tratamento de Valores Analíticos da TACO

Na publicação original da TACO, as análises químicas laboratoriais utilizam notações rigorosas que expressam diferentes realidades analíticas. O sistema preserva explicitamente `raw_value`, `numeric_value`, `value_status` e `data_quality`:

| Notação Original | Significado Oficial TACO | `value_status` | `numeric_value` | `data_quality` | Tratamento e Implicações |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Número > 0** (ex: `12.5`) | Quantidade analítica determinada | `NUMERIC_VALUE` | `12.5` | `analytical` | Valor analítico quantificado por método laboratorial. |
| **`0` ou `0.0`** | Zero laboratorial comprovado | `KNOWN_NUMERIC_ZERO` | `0.0` | `analytical` | O nutriente foi medido e comprovadamente inexiste na amostra. |
| **`"Tr"` ou `"tr"`** | Traço analítico | `TRACE` | `NULL` | `trace` | Presente, mas abaixo do limite de detecção/quantificação analítica. **NÃO é zero.** Permanece `NULL` no registro oficial. |
| **`"NA"` ou `"na"`** | Não aplicável | `NOT_APPLICABLE` | `NULL` | `not_applicable` | A análise daquele nutriente não se aplica à matriz alimentar analisada. |
| **`"*"`** | Análise desconsiderada ou sob reavaliação | `UNDER_REEVALUATION` | `NULL` | `under_reevaluation` | Dados analíticos excluídos pela curadoria da TACO por inconsistência metodológica. |
| **Campo Vazio / Blank** | Análise não solicitada | `NOT_REQUESTED` | `NULL` | `not_requested` | O nutriente não fez parte do protocolo analítico contratado para aquele grupo. |

> [!CRITICAL]
> **Invariantes Semânticos Rígidos**:
> - `TRACE != KNOWN_ZERO`: Traço indica presença em teor residual indeterminado; zero indica ausência comprovada. `approximateTraceForCalculation()` **NÃO** é chamada automaticamente na Etapa 5; TRACE permanece estritamente `null` e `TRACE`.
> - `NA != NOT_ANALYZED`: "NA" significa não aplicável à natureza do alimento; não confundir com ausência acidental.
> - `UNDER_REEVALUATION != NOT_AVAILABLE`: "*" significa que o laboratório gerou resultados que foram desconsiderados por inconsistência interna.
> - `BLANK != ZERO`: Campo vazio significa que a análise não foi solicitada, nunca que o nutriente é zero.

---

## 3. Cobertura do Dataset: Test Fixtures vs Dataset Oficial Completo

Diferenciamos formalmente os dois conjuntos de dados presentes no repositório:

1. **TEST FIXTURES (`src/data/taco/taco_4_edicao.json`)**:
   - Curadoria controlada de **20 alimentos representativos** abrangendo os principais grupos.
   - Utilizado em testes unitários e de integração de execução ultrarrápida.
2. **OFFICIAL IMPORTED DATASET (`src/data/taco/taco_4_edicao_complete.json`)**:
   - Extraído diretamente do arquivo Excel original `taco_nepa_oficial.xlsx` via pipeline reproduzível e auditável ([`scripts/parse_taco_excel.py`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/scripts/parse_taco_excel.py)).
   - Contém todos os **597 alimentos oficiais** da publicação da UNICAMP (códigos 001 a 597).
   - **548 alimentos elegíveis para o motor** (`eligible_for_engine`), possuindo todos os 4 macronutrientes obrigatórios (`energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`) não nulos.
   - **49 alimentos com nutrição incompleta** (`incomplete_nutrition`), onde ao menos um macronutriente é `NA`, `*` ou não solicitado (ex: certas bebidas alcoólicas, sal e temperos sem carboidrato/lipídeo mensurado).
   - **Consistência Calórica de Atwater**:
     - `consistent` ($\Delta \le 10\%$): 401 alimentos;
     - `within_tolerance` ($10\% < \Delta \le 20\%$): 110 alimentos;
     - `different_from_macro_estimate` ($\Delta > 20\%$): 37 alimentos (fibras dietéticas altas, álcoois e desvios laboratoriais preservados intactos);
     - `insufficient_data`: 49 alimentos.

---

## 4. Imutabilidade e Governança de Segurança (PostgreSQL Migrações 12 e 13)

- **Imutabilidade Completa dos Dados Oficiais (Inclusive para ADMIN)**:
  - Gatilhos `trg_official_food_immutability`, `trg_food_data_sources_immutability` e `trg_official_nutrient_immutability` impedem **DELETE** de alimentos e fontes oficiais por qualquer usuário da aplicação (incluindo Administrador).
  - Bloqueiam alteração direta de qualquer atributo originado da fonte:
    - `source_id`
    - `source_food_code`
    - `source_type`
    - `name`
    - `normalized_name`
    - `scientific_name`
    - `food_group`
    - `preparation_state`
    - `is_generic`
    - `validation_status`
    - e qualquer nutriente em `food_nutrients`.
  - Protegem em `food_data_sources`: `name`, `version`, `publisher`, `reference`, `checksum`, `imported_at`.
  - O Administrador pode gerenciar exclusivamente metadados operacionais de controle: `is_active`, `engine_eligibility_status`, `needs_review`.
  - Atualizações da composição analítica oficial ocorrem exclusivamente via pipeline/importador confiável e versionado executado com credenciais de manutenção (`service_role`).
- **Alimentos Customizados por Profissionais (`professional_custom`)**:
  - Obrigam vínculo a uma organização (`organization_id`).
  - Não podem utilizar o `source_id` da TACO nem alegar códigos oficiais TACO.
  - Influenciadores são proibidos de alterar `validation_status` para `verified_by_nutritionist`.

---

## 5. Medidas Caseiras e Alergênicos

- **Medidas Caseiras (`food_household_measures`)**:
  - A TACO fornece análises químicas estritamente por 100g de matéria integral e **não define medidas caseiras**.
  - As medidas cadastradas provêm de fontes externas reconhecidas (IBGE / Tabela de Medidas Caseiras de Pinheiro et al.) ou são expressamente marcadas com `is_estimated = true`.
  - Nenhuma medida fictícia é aceita sem fonte auditável registrada.
- **Alergênicos e Tags (`food_tag_mappings`)**:
  - A ausência de menção a um alergênico na TACO **NUNCA é inferida como `false`**.
  - O padrão é sempre `unknown` quando não houver laudo de ensaio ou rotulagem industrializada auditada.

---

## 6. Situação de Outras Fontes: TBCA e USDA

### TBCA (Tabela Brasileira de Composição de Alimentos — FCF/USP)
- **Status**: `PENDING_COMMERCIAL_LICENSE`.
- Não importada nesta etapa. Os termos de uso da USP exigem acordo de licenciamento específico para uso comercial automatizado.

### USDA FoodData Central
- **Status**: Fonte secundária planejada para itens ausentes na TACO, com identificador USDA FDC ID e conversão de nomenclatura.
