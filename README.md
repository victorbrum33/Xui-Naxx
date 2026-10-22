# Xui Naxx · 1.5.14

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

## Recursos

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

Consulte [Otimização](OTIMIZACAO.md) para medições, aplicação dos perfis PHP-FPM/HTTP e restauração dos backups.

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

`1.5.14` identifica a edição Xui Naxx; a base do núcleo é XUI 1.5.12. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para as origens dos componentes.
