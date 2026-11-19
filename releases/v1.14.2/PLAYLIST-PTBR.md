# Playlist e traduções do painel — 1.14.2

A janela Baixar playlist ganha explicações em português, ações identificadas, retorno ao copiar e disposição adaptada às telas menores. Ao abrir uma conta, o formato M3U Plus é sugerido pelo próprio gerador nativo. O formato, os filtros de conteúdo e os comandos dos dispositivos continuam usando as opções e os eventos do XUI.

As traduções complementares cobrem as mensagens, os rótulos e as janelas identificados nesta revisão. Dados das contas, títulos do catálogo, campos de edição e parâmetros dos formulários são preservados. Esta revisão corrige as lacunas verificadas; não afirma tradução integral de todas as telas.

A auditoria confirmou autenticação HTTP 200 na API do player, tanto na rota tradicional quanto na rota de caminho, e HTTP 200 com cabeçalho M3U em uma leitura limitada da playlist get.php. Nenhum arquivo opaco do backend, regra de nginx, configuração de serviço ou catálogo foi alterado. A edição permanece **1.14.2**, sobre XUI 1.5.12.

## Instalação manual

Extraia o pacote complementar e execute na pasta extraída:

```bash
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O pacote mantém os mesmos 24 destinos manuais: somente quatro folhas CSS e o script de interface mudam. O canal automático mantém 19 destinos e muda apenas duas folhas CSS e esse script. As funções, os módulos, os scripts e os temas da Página inicial já publicados são preservados. Recarregue o painel depois da atualização. Não é necessário reiniciar nginx.

Os anexos anteriores continuam disponíveis. Confira os hashes em `SHA256SUMS-playlist-ptbr`.
