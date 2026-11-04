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

