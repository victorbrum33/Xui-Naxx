# Melhorias da interface NAXX

Esta atualização reúne os fontes da interface, do importador e da sincronização de EPG, com o payload gerado e o aplicador que cria backup antes de gravar os arquivos.

- Identidade NAXX azul, favicon e ajustes dos temas claro e escuro.
- Navegação em português com recursos organizados por tarefa e busca no menu avançado.
- Importador integrado a Conteúdo, com arquivo ou URL, revisão de categorias e processamento em lotes.
- Ajustes do player e mensagens de reprodução em português.
- Miniaturas limitadas a 56 × 40 pixels nas tabelas, incluindo SVG e WebP.
- Atualização no menu do perfil substitui Informações da licença.
- Canal público com arquivos próprios, verificação SHA-256, backup, restauração e instalação automática diária.
- Três cards na visão geral: Acessos, Canais e Tráfego de rede, preservando os indicadores e links nativos.
- Faixa exclusiva para os três cards, gráficos em áreas próprias e resumo do servidor com linhas adaptadas ao celular, sem sobreposição.
- Otimização de atualizações do DOM, consultas automáticas com pausa em abas ocultas, leitura M3U/CSV em blocos, revisão em mensagens pequenas e seleção global sem materializar todos os IDs.
- Perfis de PHP-FPM e compressão HTTP, com backup e restauração, disponíveis pelo instalador e por scripts próprios. Medições e aplicação em `OTIMIZACAO.md`.
- Compatibilidade Redis local persistente via serviço próprio e estado “Autenticado” em português no teste nativo.
- Revisão de qualidade: nomes acessíveis em botões e abas, chaves operáveis por teclado, atalho para o conteúdo, contornos mais visíveis nos formulários e alvos maiores para toque.
- Player com tradução dinâmica dos controles, Escape no iframe e limpeza dos eventos e tentativas de conexão ao fechar.
- Proteção validada do arquivo de montagem no instalador para preservar a inicialização do banco. Escopo e verificações em `ACESSIBILIDADE.md` e `README.md`.
- Menus de conteúdo e ações organizados em português, com posicionamento fora da rolagem da tabela, teclado e limites da tela.
- Tema aplicado no CSS inicial e tela de carregamento Naxx antes da exibição do conteúdo.
- Cache e Redis em português, diagnóstico local de leitura, indicadores, relatório JSON, atualização opcional a cada 30 segundos e perfis de agendamento com validação.

O diagnóstico não reinicia o Redis nem altera suas credenciais. Quando o teste nativo diverge da consulta local, a página informa essa diferença. Os perfis preenchem os campos; use o botão nativo Salvar agendamento para persistir as alterações.
- Botões separados para atualizar as fontes XMLTV e associar canais ao EPG.
- A associação automática de EPG usa correspondências únicas de nomes normalizados. Vínculos existentes são preservados; nomes ambíguos ou sem correspondência ficam disponíveis para revisão manual.

Para aplicar em uma instalação XUI 1.5.12 compatível:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --check
sudo python3 xui-naxx/atualizacao/aplicar.py
```

O aplicador informa o caminho do backup em `/home/xui/.naxx-backups/`. Após aplicar, recarregue o painel sem usar os arquivos antigos do cache do navegador.

Para regenerar o payload após editar os fontes, execute `python3 xui-naxx/build.py` na raiz do repositório. O build usa as referências visuais já presentes em `xui-original/`. O núcleo do painel, os fluxos de instalação e os dados de cada instalação ficam fora desta atualização.
