# Correções da edição 1.14.2 — buquês e edição em massa

- O destino da importação oferece busca e seleção de vários buquês existentes, seleção dos visíveis, seleção de todos e limpeza.
- A seleção principal prevalece sobre os buquês das opções avançadas. Sem seleção, o catálogo é enviado sem buquê.
- Os destinos dos tipos pendentes são conferidos antes do primeiro lote. A seleção permanece fixa durante o envio.
- Em filmes e séries, os buquês são destinos de reserva (fallback); as regras nativas de alocação por pasta podem ter prioridade.
- A edição em massa de canais distingue a seleção da página e a seleção de todos os resultados dos filtros.
- A edição em massa também oferece filtro por domínio da fonte e tamanhos de página de 2.000 e 5.000 entradas.
- Os indicadores ONDEMAND e DIRECT têm cores distintas na lista e na edição em massa, com textos em português brasileiro.
- Ajustes na navegação mantêm o contexto correto de canais, filmes e séries.

A edição continua sendo **1.14.2**, compatível com a base XUI 1.5.12. Este complemento preserva os arquivos do núcleo, instalador, serviço de atualização e os demais módulos publicados.

O ZIP manual contém os mesmos 24 destinos de interface, manifesto SHA-256 e aplicador publicado com backup. Extraia o pacote e execute:

```bash
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O aplicador informa o caminho do backup. Recarregue o painel após aplicar. O canal automático mantém exatamente os 19 arquivos próprios permitidos.

Os arquivos de correção têm nomes próprios e não substituem os anexos anteriores da edição. Confira os hashes em SHA256SUMS-buques-edicao-massa.
