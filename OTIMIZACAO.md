# Otimização do Xui Naxx

## Melhorias aplicadas

- A interface trata apenas os elementos alterados. Animações dos gráficos e contadores deixam de provocar varreduras completas da página.
- Indicadores da visão geral atualizam a cada 3 segundos; cabeçalho e tabelas, a cada 10 segundos; gráficos, a cada minuto. Consultas automáticas aguardam enquanto a aba estiver oculta e retomam ao voltar.
- Ações do usuário, reprodução, sessão e fila de importação mantêm seus próprios controles.
- M3U e CSV são lidos em blocos no worker. A revisão chega à interface em mensagens pequenas; seleção global usa exceções e categorias são calculadas uma vez.
- Importação mantém lotes sequenciais de 100 itens, com intervalo adaptado ao tempo de resposta do servidor, pausa e retomada.
- O perfil PHP-FPM calcula a concorrência usando RAM, CPUs e quantidade de pools. Reduz limites excessivos, recicla workers após 1.000 requisições e mantém processos ociosos por pelo menos 15 segundos.
- OPcache e strings usam até 128 MB e 8 MB por master quando a configuração anterior for maior. A configuração de ativação do cache CLI é preservada.
- Nginx comprime HTML, CSS, JavaScript, JSON e SVG com gzip de nível 2. Os tipos de vídeo e transporte binário ficam fora dessa configuração. Configurações HTTP personalizadas são preservadas.

## Medições de referência — 22/10/2026

| Cenário | Antes | Depois |
| --- | ---: | ---: |
| Consultas de indicadores em 20 s | 38 | 9 |
| JavaScript nessa amostra de 20 s | 160 ms | 18 ms |
| Consultas globais durante 90 quadros de gráfico | 667 | 82 |
| M3U com 120 mil itens, mediana | 1.808 ms | 603 ms |
| Memória temporária do CSV com 120 mil itens | 111 MB | 59 MB |
| Maior pausa da interface, CSV de 180 mil itens / 13,3 MB | 186 ms | 32 ms |
| JavaScript transferido, arquivo de referência | 131 KB | 46 KB |
| CSS transferido, arquivo de referência | 127 KB | 29 KB |
| Concorrência máxima PHP configurada, servidor de 1 CPU / 2 GB | 16.000 | 24 |

São medições locais em cenários controlados. Tempos, memória e capacidade real variam com o catálogo, equipamento e fontes. O cálculo de 40 MB por worker é uma estimativa de planejamento. JSON continua usando o documento completo no worker; a revisão mantém os registros válidos em memória.

O banco e o Redis apresentaram memória disponível, fila e bloqueios sem pressão nessa instalação. Seus parâmetros foram preservados. As recargas do PHP-FPM e nginx mantiveram o mesmo processo de transmissão ativo.

## Conferir e aplicar no servidor

O instalador executa os perfis após os serviços estarem ativos. Para aplicar separadamente na raiz do repositório:

```bash
sudo python3 scripts/otimizar_sistema.py --check
sudo python3 scripts/otimizar_http.py --check
sudo python3 scripts/otimizar_sistema.py --apply
sudo python3 scripts/otimizar_http.py --apply
```

Cada ferramenta valida os arquivos, salva backup privado e recarrega apenas os processos necessários. Em caso de falha, repõe os arquivos anteriores. O diagnóstico de PHP-FPM usa sockets locais.

Para restaurar, use o caminho ou identificador informado ao aplicar:

```bash
sudo python3 scripts/otimizar_sistema.py --restore CAMINHO_DO_BACKUP
sudo python3 scripts/otimizar_http.py --restore ID_DO_BACKUP_HTTP
```

O pacote da aba **Atualização** distribui as melhorias da interface e do importador. Os perfis de serviços são aplicados pelo instalador ou pelos comandos acima.

Referências das diretivas: [PHP-FPM](https://www.php.net/manual/en/install.fpm.configuration.php), [OPcache](https://www.php.net/manual/en/opcache.configuration.php) e [gzip no nginx](https://nginx.org/en/docs/http/ngx_http_gzip_module.html).
