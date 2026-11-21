# XUI NAXX 1.15 — links e logos em massa

Na tela **Editar em massa**, selecione os canais e abra **Links e logos**. É possível substituir um trecho dos links ou dos logos, definir um logo comum e carregar uma playlist M3U por arquivo ou URL para atualizar os canais existentes. A playlist é comparada pelo nome dos canais selecionados; nomes duplicados ou ambíguos não são aplicados automaticamente.

A prévia mostra as alterações antes da confirmação. A gravação modifica somente os links e/ou logos escolhidos dos canais selecionados; categorias, bouquets, EPG e configurações de transmissão permanecem preservados. A playlist não cadastra novos canais. Se os canais mudarem depois da prévia, gere uma nova análise.

Este complemento mantém a edição **1.15**, a identificação interna **1.15.0** e a base **XUI 1.5.12**. A instalação acrescenta o recurso; alterações no catálogo dependem da seleção, prévia e confirmação na interface.

## Instalação manual

Extraia o pacote e execute na pasta extraída:

```bash
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O pacote mantém os mesmos 24 destinos manuais e os mesmos 19 destinos do canal automático. O aplicador cria backup dos arquivos alterados. Recarregue o painel depois de atualizar. Confira os hashes em `SHA256SUMS-links-logos`.
