# Testes de inicialização e do player

Execute na raiz do repositório com Python 3 e Node.js. Não há dependências externas:

```bash
python3 tests/test-ondemand-profile.py
node tests/verify-player-origin-offline.cjs
```

O teste Python verifica as janelas de buffer, aplicação, restauração e recuperação de
falhas com banco e cache simulados. O teste JavaScript executa o monitor do player
com DOM e JWPlayer simulados, incluindo origem, token, erros concorrentes e fechamento.

Os testes não acessam servidores, contas ou canais e não medem o tempo até o primeiro
quadro. Uma verificação real depende da fonte, dos quadros-chave e do aplicativo usado.

### NAXX Automático — 1.5.14.1

Execute na raiz do repositório:

```bash
php tests/test-ondemand-policy.php
php tests/test-ondemand-api.php
node --unhandled-rejections=strict tests/verify-ondemand-ui-offline.cjs
```

O teste da política não acessa fontes. O teste do endpoint usa um servidor PHP
temporário com sessão e PDO simulados; o teste da interface simula DOM e HTTP.
Nenhum desses testes conecta a uma instalação XUI ou altera canais.

O ciclo do serviço de atualização deve ser verificado em Linux, por usar sockets
Unix, permissões e primitivas de arquivos dessa plataforma:

```bash
python3 tests/test-update-service.py
```

`tests/fixtures/llod-native-results.json` registra os ensaios locais com fontes
sintéticas H.264/AAC e abertura pela prévia administrativa. O resultado não é uma
garantia de tempo do primeiro quadro no aplicativo. Consulte
[NAXX Automático](../NAXX-AUTOMATICO.md) para condições, limites e uso.

### Canais e correções gerais da edição 1.5.14.1

Em Canais, use o filtro de domínio da fonte e selecione 2.000 ou 5.000 entradas.
O painel carrega as páginas maiores em lotes do tamanho aceito pelo XUI.

Execute na raiz do repositório com Node.js e PHP CLI:

    node --unhandled-rejections=strict tests/verify-stream-page-size-offline.cjs
    node --unhandled-rejections=strict tests/verify-stream-source-ui-offline.cjs
    php tests/test-stream-source-api.php
    node --unhandled-rejections=strict tests/verify-ondemand-ui-offline.cjs
    node --unhandled-rejections=strict tests/verify-import-update-state-offline.cjs
    node --unhandled-rejections=strict tests/verify-menu-keyboard-offline.cjs
    node --unhandled-rejections=strict tests/verify-cleanup-navigation-offline.cjs

Os testes de Canais verificam a seleção de tamanho, a filtragem por domínio, a
paginação em lotes e o contrato do endpoint com dados sintéticos. Os demais
verificam os modos de importação, a restauração com backup, o modo Automático,
o teclado nos menus e o cancelamento da limpeza em lotes.

A validação usa DOM e respostas simulados e um servidor PHP temporário em
loopback. O tempo de resposta com listas grandes depende dos dados, do servidor
e do navegador.
