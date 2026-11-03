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
