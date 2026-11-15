# Correção de layout da edição em massa — 1.14.2

A tabela de seleção de canais na edição em massa passa a ocupar toda a largura disponível, inclusive quando os controles nativos envolvem a tabela em um contêiner de rolagem. Os filtros, a seleção e as ações existentes são preservados.

A correção acrescenta um seletor à regra CSS existente. O JavaScript de interface mantém os mesmos módulos e recebe somente a revisão do endereço da folha de estilos. A aba Página inicial, seus quatro temas, helper, API e os demais recursos publicados são preservados. A edição permanece **1.14.2**, sobre XUI 1.5.12.

## Instalação manual

Extraia o pacote complementar e execute na pasta extraída:

```bash
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O pacote contém os mesmos 24 destinos manuais; apenas quatro folhas CSS e a revisão da folha no script de interface mudam. Os scripts e temas incluídos mantêm os bytes já publicados. O canal automático mantém os mesmos 19 destinos; mudam somente duas folhas CSS e essa revisão. Recarregue o painel após a atualização. Não é necessário reiniciar nginx.

Os anexos anteriores permanecem disponíveis e não são substituídos. Confira os hashes em `SHA256SUMS-mass-layout`.
