# Xui Naxx · 1.14.2

Painel em português brasileiro, com identidade azul, temas claro e escuro, interface adaptada a dispositivos móveis e ferramentas para canais, filmes e séries.

## 🏆 Sistemas operacionais

| Sistema | Instalação completa |
| --- | --- |
| Ubuntu 20.04 x86_64 | ✅ Ambiente validado |
| Ubuntu 18.04 | ⏳ Não validado |
| Ubuntu 22.04 | ⏳ Não validado |
| Ubuntu 24.04 | ⏳ Não validado |

O instalador completo aceita Ubuntu 20.04 x86_64 em um servidor novo, com pelo menos 5 GB livres. As demais versões exigem adaptação e testes das dependências do núcleo.

## 💡 Instalação

Execute no servidor Linux:

```bash
sudo apt-get update
sudo apt-get install -y git python3 ca-certificates
git clone https://github.com/victorbrum33/Xui-Naxx.git
cd Xui-Naxx
chmod +x install.sh
sudo ./install.sh
```

O repositório é público e pode ser clonado sem autenticação. A instalação baixa os componentes da referência com hashes SHA-256 fixados, prepara os serviços e informa o código de acesso gerado. No primeiro acesso, cadastre o administrador pela tela do painel. Nenhuma senha administrativa padrão é publicada.

Para conferir uma instalação existente sem aplicar mudanças:

```bash
sudo ./install.sh --check
```

Se `/home/xui` já contiver uma instalação compatível, o instalador atualiza a interface com backup e instala os serviços de manutenção e atualização automática.

## Naxx Sync e MariaDB

A instalação padrão mantém o MariaDB em `127.0.0.1:3306`. Para usar o Naxx Sync diretamente de outro computador, configure o acesso remoto no servidor XUI. `ECONNREFUSED` significa que a conexão TCP falhou antes da autenticação; conceder permissões à conta `@'%'` não altera a escuta do banco.

Atualize este repositório e execute como root, substituindo `IPV4_PUBLICO_DO_SYNC` pelo IPv4 público do computador que executa o Sync:

```bash
git pull --ff-only
sudo python3 scripts/configurar_mysql_sync.py --user naxx_sync --account-host '%' --apply --allow-remote --client-ip IPV4_PUBLICO_DO_SYNC
```

A conta MySQL precisa existir. O helper acrescenta os privilégios de catálogo que faltam, aplica um filtro na porta 3306 para o IP informado e loopback, configura a escuta IPv4 e reinicia o MariaDB. O filtro é reaplicado antes de cada partida do banco, inclusive após reiniciar o servidor. As demais regras de firewall e a configuração base do MariaDB são preservadas.

No perfil do Sync, informe o **IP do servidor XUI**, porta **3306**, banco **xui** e a conta MySQL. Valide em **Servidores → Testar selecionados**. Se o IPv4 público do computador mudar, execute novamente o comando com o novo IP. Um firewall do provedor também precisa permitir a conexão desse computador.

Para conferir ou aplicar apenas permissões, sem mudar a rede:

```bash
sudo python3 scripts/configurar_mysql_sync.py --user naxx_sync --account-host '%' --check
sudo python3 scripts/configurar_mysql_sync.py --user naxx_sync --account-host '%' --apply
```

O script acrescenta somente os privilégios necessários nas tabelas de canais, filmes, séries, categorias, listas e EPG. Não cria usuários nem redefine senhas. O Sync pode avisar que não conseguiu reiniciar a sequência de IDs e prosseguir com a importação.

O túnel SSH continua disponível como alternativa sem habilitar a escuta remota:

```bash
ssh -N -L 127.0.0.1:13306:127.0.0.1:3306 usuario_ssh@SERVIDOR
```

Nesse caso, mantenha o comando aberto no computador do Sync e use host `127.0.0.1` e porta `13306` no perfil. Consulte [configuração do MySQL para o Sync](MYSQL-SYNC.md) para os detalhes.

**Subir tudo do zero** limpa o catálogo antes de importar. Faça um backup do catálogo antes dessa operação.

Testes offline do helper:

```bash
python3 tests/test-mysql-sync.py
```

## Recursos

### Correção de buquês e edição em massa — 1.14.2

O importador permite escolher vários buquês existentes no destino da importação. A seleção principal prevalece sobre as opções avançadas e pode ficar vazia. Para filmes e séries, o destino funciona como reserva (fallback), sujeito às regras nativas de alocação por pasta. A edição em massa distingue a seleção da página e a seleção de todos os resultados filtrados. Ela também oferece filtro por domínio da fonte e páginas de 2.000 ou 5.000 entradas. Os indicadores ONDEMAND e DIRECT usam cores distintas, com textos em português brasileiro. Consulte [as correções e os pacotes complementares](releases/v1.14.2/CORRECOES.md).

### Edição 1.14.2

O menu superior oferece nove paletas. Os buquês permitem selecionar o catálogo completo e organizar canais, filmes, séries e rádios com comandos simplificados.

- **NAXX Automático:** escolha do modo de baixa latência ao salvar um canal, com análise das fontes, combinação validada e retorno aos modos manuais. Consulte [uso, testes e limites](NAXX-AUTOMATICO.md).
- Importador em **Conteúdo**, por arquivo ou URL, com revisão de categorias, canais, filmes, séries e episódios.
- Análise em processo separado e envio em lotes sequenciais, com pausa, retomada e progresso. Sem o antigo limite fixo de 10 MB; o processamento depende dos recursos do servidor e do navegador.
- Ferramentas rápidas para excluir conteúdo por tipo ou apagar todo o conteúdo, sem seleção individual.
- Player integrado com visual azul, reprodução HLS, mensagens em português e layout para dispositivos móveis.
- Logos SVG, WebP e AVIF, com miniaturas proporcionais nas tabelas.
- Sincronização automática dos IDs de EPG por correspondência única, preservando vínculos existentes e separando casos ambíguos.
- Menus organizados em **Equipe**, **Clientes**, **Conteúdo** e **Avançado**, com busca nas ferramentas.
- Configurações gerais e cache traduzidos, favicon e rodapé 2026.
- Diagnóstico local de Redis com memória, latência, chaves, clientes e taxa de acertos; exportação do relatório e atualização opcional a cada 30 segundos.
- Perfis de agendamento com validação de minuto, hora e threads; os valores são aplicados somente ao salvar.
- Cards agrupados em Acessos, Canais e Tráfego de rede, menus de ações sem recorte e tema inicial Naxx durante o carregamento.
- Interface com atualizações parciais, consultas automáticas pausadas em abas ocultas, importador com menos cópias em memória e perfil de serviços proporcional aos recursos do servidor.
- Compatibilidade local do Redis com o IP usado pelo núcleo, mantendo o serviço em loopback e a autenticação configurada.

Consulte [Otimização](OTIMIZACAO.md) para medições, aplicação dos perfis PHP-FPM/HTTP e restauração dos backups.

## Revisão de qualidade

O painel inclui identificação dos botões de ícones, navegação por teclado nas chaves de configuração, atalho para o conteúdo e melhorias no foco e na tradução do player. Confira o escopo e os testes em [Acessibilidade e usabilidade](ACESSIBILIDADE.md).

O instalador também valida e protege `/etc/fstab`, evitando que uma rotina legada esvazie a montagem raiz e impeça o banco de iniciar após reiniciar a máquina. A proteção mantém o conteúdo do arquivo e salva uma cópia privada ao ser aplicada pela primeira vez.

Para conferir a proteção:

```bash
sudo python3 scripts/proteger_inicializacao.py --check
```

Antes de editar manualmente as montagens do sistema, libere o arquivo e reaplique a proteção após validar as alterações:

```bash
sudo python3 scripts/proteger_inicializacao.py --unprotect
# Edite e valide /etc/fstab
sudo python3 scripts/proteger_inicializacao.py --apply
```

## Atualizações

Abra **perfil → Atualização** para consultar versões, verificar e instalar manualmente, ativar a instalação automática diária ou restaurar o último backup. O serviço instala somente os arquivos próprios permitidos, verifica o SHA-256 e mantém backup antes da aplicação. O núcleo, as credenciais e o banco de dados ficam fora desse pacote.

O canal público está em [Xui-Naxx-Updates](https://github.com/victorbrum33/Xui-Naxx-Updates). Ele distribui o pacote de melhorias sem exigir token do GitHub no painel.

Para instalar o serviço de atualização separadamente:

```bash
sudo python3 scripts/instalar_atualizador.py --install
```

Para aplicar a interface manualmente:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --check
sudo python3 xui-naxx/atualizacao/aplicar.py
```

O aplicador informa o backup criado em `/home/xui/.naxx-backups/`. Para restaurar:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --restore /home/xui/.naxx-backups/SEU-BACKUP
```

## Desenvolvimento

`xui-naxx/src/` contém os fontes das melhorias. Para regenerar os arquivos da interface com as referências presentes em `xui-original/`:

```bash
python3 xui-naxx/build.py
```

`1.14.2` identifica a edição Xui Naxx; a base do núcleo é XUI 1.5.12. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para as origens dos componentes.


## Perfil opcional de memória do MariaDB — 1.14.2

Em instalações existentes com MariaDB 10.3 e `one-thread-per-connection`, o helper limita `thread_cache_size` a no máximo 8, preservando um valor atual menor. Execute no Linux como root, com autenticação local do MariaDB por socket:

```bash
sudo python3 scripts/otimizar_memoria_mysql.py --check
sudo python3 scripts/otimizar_memoria_mysql.py --apply
sudo python3 scripts/otimizar_memoria_mysql.py --apply --flush-idle
```

`--check` apenas diagnostica. `--apply` salva o perfil em `/etc/mysql/mariadb.conf.d/zz-naxx-memory.cnf` e ajusta o valor global quando necessário. `--flush-idle` é opcional: com `--apply`, libera o cache somente se houver mais threads ociosas que o limite. O helper não reinicia o banco, não encerra conexões ativas e não altera dados do catálogo. A redução de RAM depende do histórico e da carga; não há ganho fixo ou garantido. Novas instalações já recebem `thread_cache_size=8` no perfil inicial.

Antes de mudar algo, o helper grava um backup JSON protegido em `/var/lib/naxx-performance/mysql-memory-backups/` e informa seu caminho. Para restauração manual, use `before.thread_cache_size` para repor o valor global e `previous_base64`/`previous_mode` para restaurar o arquivo anterior; se `previous_base64` for nulo, o arquivo não existia. Preserve o backup e faça a restauração como root. Threads já liberadas não são recriadas pela restauração.
