# Acesso direto do Naxx Sync ao MariaDB

Se o teste retorna `ECONNREFUSED` no IP do XUI, confira a escuta no servidor:

```bash
sudo python3 scripts/configurar_mysql_sync.py --user naxx_sync --account-host '%' --check
```

A instalação padrão mantém o banco em `127.0.0.1:3306`. Para usar o IP do
servidor diretamente no Sync, autorize o IPv4 público do computador que executa
o aplicativo. Substitua `IP_DO_COMPUTADOR_SYNC` pelo endereço individual, sem
barra ou máscara:

```bash
sudo python3 scripts/configurar_mysql_sync.py --user naxx_sync --account-host '%' --apply --allow-remote --client-ip IP_DO_COMPUTADOR_SYNC
```

A conta dedicada precisa existir. O comando acrescenta somente as permissões
de catálogo necessárias e não altera sua senha. Configure o perfil do Sync com
o IP do servidor XUI, porta `3306`, banco `xui` e as credenciais dessa conta.
Use **Testar conexão** antes de executar uma importação.

O acesso remoto é uma opção explícita para Ubuntu com MariaDB, systemd e
iptables. O helper instala uma chain exclusiva na entrada TCP da porta 3306:
aceita loopback e o IPv4 informado e bloqueia as demais origens. Uma dependência
do MariaDB reaplica essa restrição antes de cada partida do banco. As demais
regras, incluindo NAT, são preservadas. O host `%` da conta MySQL não remove a
restrição de rede por IP.

O arquivo original `99-naxx.cnf` permanece intacto. O override separado
`zz-naxx-sync.cnf` é escrito depois dos arquivos da proteção persistente. A
primeira aplicação reinicia o MariaDB; uma repetição sem mudanças não reinicia
o banco. Em caso de falha, o helper tenta restaurar os arquivos e a chain
anteriores; se a restauração falhar, mantém a restrição de rede e informa o erro.

Se o IP público do computador mudar, execute novamente com o novo IPv4. Isso
substitui o único IP autorizado. Um firewall adicional do provedor também deve
permitir TCP 3306 a partir desse IP. O helper não configura TLS do MySQL; para
redes sem proteção, use TLS validado no cliente ou o túnel SSH documentado no
[guia do instalador](README.md#naxx-sync-e-mariadb).

O comportamento da escuta está documentado na
[documentação do MariaDB](https://mariadb.com/docs/server/mariadb-quickstart-guides/mariadb-remote-connection-guide).
As dependências `Requires` e `After` seguem a
[documentação do systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html).

Testes offline:

```bash
python3 tests/test-mysql-sync.py
```
