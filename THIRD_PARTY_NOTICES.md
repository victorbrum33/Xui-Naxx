# Componentes e origem

PAINEL NAXX 1.5.14 é a identificação desta edição de interface, tradução e ferramentas. A base do painel é XUI 1.5.12; a numeração NAXX não representa uma atualização oficial do núcleo.

## XUI e referências comunitárias

- Referência de instalação: https://github.com/PabloServers/xui.one
- Referência comunitária original: https://github.com/amidevous/xui.one
- Revisão da referência consultada: `defdb397e7b1d44e6a105074971a41c9c6d0f4eb` de PabloServers/xui.one.

O pacote completo contém o núcleo original e os componentes comunitários usados na instalação do laboratório. O histórico Git contém apenas as referências mínimas necessárias para gerar a interface, além dos arquivos personalizados.

Os direitos dos arquivos originais e das dependências permanecem com seus respectivos titulares. A disponibilidade dos arquivos nesses repositórios não é uma declaração de domínio público. Este projeto não concede uma licença nova para o XUI nem para os componentes de terceiros; respeite os avisos e termos aplicáveis a cada componente.

## Integridade dos componentes comunitários

O instalador verifica os arquivos comunitários antes de aplicar a correção da referência:

```text
04f69edb87102ec6710dd1b0274ae0fc557c5eb7389434558600d54ad91d5b19  xui.so
2f722718511b51ea1a621dfd91a225ee939b52b9682e16e495a434188e829327  license
```

A aplicação cria backup do núcleo anterior. Nenhuma credencial de uma instalação particular é necessária ou incluída no repositório.

## Dependências

A VM usa imagem oficial Ubuntu 20.04, VirtualBox e cloud-init. O painel original inclui componentes próprios e dependências como PHP, nginx, Redis e bibliotecas de interface. Os arquivos originais e seus avisos devem ser preservados quando aplicável.
