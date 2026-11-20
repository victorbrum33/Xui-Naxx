# XUI NAXX 1.15 — exclusão em massa

A exclusão em massa de canais recebe um filtro de fonte. As tabelas nativas ganham opções de 2.000 e 5.000 itens por página para permitir a seleção de mais de mil registros. Os filtros, os identificadores selecionados e a confirmação de exclusão continuam integrados ao fluxo nativo do painel.

A janela Baixar playlist sugere M3U Plus ao abrir a conta, esclarece o filtro de conteúdo e identifica as ações de copiar e baixar, com retorno sobre cópia e download. Os formatos e comandos dos dispositivos continuam usando o gerador nativo.

As traduções complementares incluem cabeçalhos de contas, diálogos e 100 mensagens fixas verificadas nesta revisão. Dados cadastrados e ações são preservados; não se afirma tradução integral de todas as telas. Os temas da Página inicial também permanecem disponíveis.

A edição exibida no login, no rodapé e na página de atualização passa a ser exatamente **1.15**. Os manifestos usam a identificação interna **1.15.0** para compatibilidade com os serviços de atualização já instalados; a edição e a tag pública são **1.15**. A base continua **XUI 1.5.12**. Verificações funcionais autenticadas de player_api.php e get.php retornaram HTTP 200, com cabeçalho M3U na leitura limitada da playlist. Nenhum arquivo opaco do backend, catálogo ou regra de nginx é substituído.

## Instalação manual

Extraia o pacote e execute na pasta extraída:

```bash
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O pacote mantém os mesmos 24 destinos manuais; o canal automático mantém os mesmos 19 destinos. O aplicador cria backup dos arquivos alterados. Recarregue o painel depois de atualizar. Não é necessário reiniciar nginx. Confira os hashes em `SHA256SUMS`.
