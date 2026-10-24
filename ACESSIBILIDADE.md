# Revisão de acessibilidade e usabilidade — Xui Naxx

**Referência:** WCAG 2.1 AA para os critérios avaliados. **Data:** 24/10/2026.

## Resumo

Foram corrigidos seis grupos de problemas: nenhum crítico, quatro de impacto maior e dois de impacto menor. A revisão cobriu visão geral, canais, configurações, cache e Redis, EPG, importador e ferramentas rápidas. Nas amostras de 320 e 1440 pixels, os controles visíveis avaliados ficaram com identificação e os campos avaliados ficaram com rótulos; as páginas não ultrapassaram a largura da tela.

## Constatações e correções

### Percepção

| Problema | Critério | Impacto | Correção |
| --- | --- | --- | --- |
| Contorno de campos com pouco contraste | 1.4.11 | Maior | Cores de contorno ajustadas nos temas claro e escuro |

### Operação

| Problema | Critério | Impacto | Correção |
| --- | --- | --- | --- |
| Chaves Switchery com checkbox removido da navegação por teclado | 2.1.1 | Maior | Checkbox nativo volta a receber foco e Espaço; o componente visual acompanha o estado |
| Escape dentro do iframe não fechava a prévia | 2.4.3 | Menor | Escape fecha o player e devolve o foco; tela cheia mantém seu próprio Escape |
| Alguns botões de ícones tinham menos de 44 pixels de largura no celular | 2.5.5, recomendação AAA | Menor | Área dos botões de ação ampliada para 44 pixels |

### Compreensão

| Problema | Critério | Impacto | Correção |
| --- | --- | --- | --- |
| Campos de minuto, hora e threads sem associação programática ao rótulo | 1.3.1 / 4.1.2 | Maior | Rótulos acessíveis explícitos em português |

### Robustez

| Problema | Critério | Impacto | Correção |
| --- | --- | --- | --- |
| Ícones de reproduzir, atualizar, editar, excluir, paginação e menus sem nome acessível | 4.1.2 | Maior | Nomes de ação em português; abas com nome mesmo quando o texto fica oculto no celular |

## Contraste

| Elemento | Cores | Relação | Referência | Resultado |
| --- | --- | ---: | ---: | --- |
| Texto principal escuro | `#e9f0f8` / `#0a101c` | 16,56:1 | 4,5:1 | Aprovado |
| Texto do botão principal escuro | `#071a33` / `#4b8df7` | 5,36:1 | 4,5:1 | Aprovado |
| Texto principal claro | `#172b43` / `#f3f6fa` | 13,24:1 | 4,5:1 | Aprovado |
| Texto do botão principal claro | `#ffffff` / `#2563eb` | 5,17:1 | 4,5:1 | Aprovado |
| Contorno do campo contra o card escuro | `#60748f` / `#111b2b` | 3,61:1 | 3:1 | Aprovado |
| Contorno do campo claro | `#78899d` / `#ffffff` | 3,58:1 | 3:1 | Aprovado |

## Navegação por teclado

| Controle | Comportamento verificado |
| --- | --- |
| Ir para o conteúdo | Primeiro atalho por Tab; Enter leva o foco à área principal |
| Chave de configuração | Tab alcança o checkbox; Espaço alterna e atualiza o desenho da chave |
| Menu de ações | Teclas de direção percorrem itens; Escape fecha e devolve o foco |
| Player | Escape dentro do iframe fecha a prévia e devolve o foco ao botão de reprodução |

A árvore de acessibilidade do Chromium confirmou o papel, o nome e o estado marcado do checkbox de teste. Os testes de alternância usaram um controle isolado; nenhuma configuração foi salva.

## Player e limites da revisão

O canal disponível para teste reproduziu HLS em 1280 × 720 no computador e no Android emulado. Tradução dinâmica dos controles, fechamento e foco foram verificados. Observadores, tentativas de conexão e eventos são removidos ao fechar ou recarregar a prévia.

Esta revisão não é uma certificação de conformidade de todas as telas. NVDA, VoiceOver, dispositivos físicos, Firefox e Safari não foram avaliados. Links textuais dentro de tabelas mantêm o espaçamento nativo; o alvo de 44 pixels foi aplicado aos botões de ação. Conteúdo e codecs de outros provedores precisam de validação própria.

Referências: [contraste de componentes](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) e [alvos de 44 pixels, nível AAA](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html).
