# PAINEL NAXX · edição 1.5.14

Interface em português brasileiro para a base XUI 1.5.12, com temas claro e escuro, navegação adaptada a telas menores e importador de canais, filmes e séries integrado ao menu **Conteúdo**.

**1.5.14 identifica esta edição NAXX. O núcleo distribuído continua sendo a base XUI 1.5.12.**

## Recursos

- Importação de M3U/M3U8, CSV e JSON, com revisão, categorias editáveis e identificação de séries e episódios.
- Leitura de listas em um processo do navegador separado da interface, sem um limite fixo de 10 MB ou de quantidade de itens.
- Envio ao painel em lotes sequenciais, com progresso, pausa, retomada e cancelamento dos próximos lotes.
- Ações em **Ferramentas rápidas** para apagar canais, filmes, séries ou todo o conteúdo, sem selecionar os itens nas tabelas.
- Configurações traduzidas e recursos avançados agrupados no menu.
- Manutenção nativa do banco instalada como serviço, com backup antes de atualizar o esquema.
- Prévia local para Windows e scripts para criar uma VM de teste no VirtualBox.

Listas grandes continuam dependendo da memória disponível no navegador, do espaço em disco e da capacidade do servidor. A importação de séries usa a fila nativa do XUI; a aceitação do lote não significa que todos os episódios já terminaram de processar.

## Sistemas atendidos

| Uso | Suporte implementado |
| --- | --- |
| Instalação completa | VM VirtualBox nova, Ubuntu 20.04, x86_64 |
| Atualização da interface | Instalação compatível com XUI 1.5.12 em `/home/xui`, validada pelo aplicador |
| Laboratório no Windows | Python 3, VirtualBox e OpenSSH; criação de ISO requer `pycdlib` |
| Prévia visual no Windows | Python 3; dados simulados |

O instalador completo verifica Ubuntu 20.04 e VirtualBox antes de continuar. Ubuntu 22.04, Ubuntu 24.04 e instalação direta em VPS não foram validados por este projeto.

## Instalação e atualização pelo Git

```bash
sudo apt-get update
sudo apt-get install -y git python3 ca-certificates
git clone https://github.com/victorbrum33/PAINELNAX.git
cd PAINELNAX
chmod +x install.sh
sudo ./install.sh
```

O repositório é privado. A conta usada para clonar precisa ter acesso. Use a autenticação do Git/SSH ou `gh auth login`; não coloque tokens em comandos ou endereços de download.

Se `/home/xui` já existir, `install.sh` aplica os arquivos da interface com backup e instala a manutenção automática do banco. O aplicador interrompe a atualização se encontrar arquivos incompatíveis ou alterações que não reconhece.

Em uma VM nova, o instalador baixa o pacote XUI 1.5.12 e os componentes comunitários da referência original. Os hashes SHA-256 esperados estão fixados em `scripts/instalar.py`. Ele extrai apenas os arquivos necessários e recusa um download diferente da base conhecida.

Também é possível usar um pacote completo NAXX fornecido pelo mantenedor. O hash deve corresponder a `releases/v1.5.14/SHA256SUMS` deste commit:

```bash
sudo ./install.sh --bundle /caminho/XUI-NAXX-COMPLETO.zip
```

Depois da instalação, use o endereço e o código gerados para a sua VM. No primeiro acesso, conclua o cadastro do administrador pela tela do próprio painel. O projeto não publica uma senha administrativa padrão.

## Laboratório no Windows

1. Instale Python 3, VirtualBox e o cliente OpenSSH.
2. Instale a dependência da ISO: `py -3 -m pip install pycdlib`.
3. Execute `BAIXAR-PACOTE.bat` para baixar os componentes originais com verificação de hash. Para usar um pacote NAXX já baixado, execute `BAIXAR-PACOTE.bat --bundle "C:\caminho\XUI-NAXX-COMPLETO.zip"`.
4. Execute `xui-naxx\CRIAR-VM.bat` e aguarde a primeira inicialização do Ubuntu.
5. Execute `xui-naxx\INSTALAR-NA-VM.bat`.
6. Abra `xui-naxx\ABRIR-PAINEL-REAL.bat`.

O diretório padrão da VM é `F:\virtualbox\XUI-NAXX-LAB`, com 1 CPU, 2 GB de RAM e disco dinâmico de 32 GB. Para escolher outro diretório, execute os scripts Python com `--base-dir` e `--config` correspondentes; o lançador `iniciar_vm.py` atualmente usa o diretório padrão. Cada instalação gera sua própria chave SSH e seu código de acesso.

Se você extraiu o pacote completo fornecido pelo mantenedor, o núcleo e os componentes já estão presentes: comece pela criação da VM, sem executar a etapa `BAIXAR-PACOTE.bat`. Os arquivos do instalador Linux com download verificado ficam no clone Git.

Para ver somente a interface com dados simulados, execute `xui-naxx\INICIAR-PAINEL.bat`. Essa prévia não administra o XUI real.

## Atualização visual manual

Confira a compatibilidade antes de aplicar:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --check
sudo python3 xui-naxx/atualizacao/aplicar.py
```

No pacote leve de atualização, a pasta `atualizacao` fica na raiz: use `sudo python3 atualizacao/aplicar.py --check` e `sudo python3 atualizacao/aplicar.py` depois de extrair o ZIP.

O aplicador informa o diretório do backup criado em `/home/xui/.naxx-backups/`. Para restaurá-lo, informe o caminho que foi gerado:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --restore /home/xui/.naxx-backups/SEU-BACKUP
```

Para instalar a rotina automática de manutenção separadamente:

```bash
sudo python3 xui-naxx/vm/atualizar_banco.py --install
```

A rotina executa o atualizador nativo `/home/xui/status` na inicialização. Ela registra o estado em `/var/lib/xui-naxx/` e guarda backups em `/var/backups/xui-naxx/`. Isso atualiza o esquema local; não baixa versões novas do projeto pelo GitHub.

## Estrutura

```text
install.sh                   Entrada do instalador Linux
scripts/instalar.py           Download verificado e preparação da instalação
BAIXAR-PACOTE.bat             Prepara os arquivos grandes no Windows
xui-naxx/src/                Código da interface e do importador
xui-naxx/previa/             Prévia local com dados simulados
xui-naxx/atualizacao/        Payload, manifesto e aplicador com backup
xui-naxx/vm/                 Scripts da VM e manutenção do banco
xui-original/                Referências mínimas para regenerar a interface
releases/v1.5.14/SHA256SUMS   Hashes dos pacotes NAXX preparados
```

O núcleo original é grande e fica fora do histórico Git. O instalador usa os arquivos da referência original com hashes fixos; um pacote completo NAXX pode ser disponibilizado pelo mantenedor separadamente. Depois de alterar os fontes, execute `python3 xui-naxx/build.py` para regenerar o payload da atualização.

## Origem

O fluxo `git clone` → `chmod +x install.sh` → `./install.sh` foi organizado seguindo a referência [PabloServers/xui.one](https://github.com/PabloServers/xui.one). A base e os componentes comunitários foram obtidos a partir dessa referência e de [amidevous/xui.one](https://github.com/amidevous/xui.one).

Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Este repositório não atribui uma nova licença ao núcleo XUI ou aos componentes de terceiros.
