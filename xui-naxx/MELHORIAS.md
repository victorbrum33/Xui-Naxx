# Melhorias da interface NAXX

Esta atualização reúne os fontes da interface, do importador e da sincronização de EPG, com o payload gerado e o aplicador que cria backup antes de gravar os arquivos.

- Identidade NAXX azul, favicon e ajustes dos temas claro e escuro.
- Navegação em português com recursos organizados por tarefa e busca no menu avançado.
- Importador integrado a Conteúdo, com arquivo ou URL, revisão de categorias e processamento em lotes.
- Ajustes do player e mensagens de reprodução em português.
- Miniaturas limitadas a 56 × 40 pixels nas tabelas, incluindo SVG e WebP.
- Atualização no menu do perfil substitui Informações da licença.
- Canal público com arquivos próprios, verificação SHA-256, backup, restauração e instalação automática diária.
- Botões separados para atualizar as fontes XMLTV e associar canais ao EPG.
- A associação automática de EPG usa correspondências únicas de nomes normalizados. Vínculos existentes são preservados; nomes ambíguos ou sem correspondência ficam disponíveis para revisão manual.

Para aplicar em uma instalação XUI 1.5.12 compatível:

```bash
sudo python3 xui-naxx/atualizacao/aplicar.py --check
sudo python3 xui-naxx/atualizacao/aplicar.py
```

O aplicador informa o caminho do backup em `/home/xui/.naxx-backups/`. Após aplicar, recarregue o painel sem usar os arquivos antigos do cache do navegador.

Para regenerar o payload após editar os fontes, execute `python3 xui-naxx/build.py` na raiz do repositório. O build usa as referências visuais já presentes em `xui-original/`. O núcleo do painel, os fluxos de instalação e os dados de cada instalação ficam fora desta atualização.
