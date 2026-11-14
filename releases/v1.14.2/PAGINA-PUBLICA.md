# Página inicial — edição 1.14.2

A aba **Página inicial**, em Configurações, oferece quatro modelos: Naxx Azul, Aurora, Claro e Cinema. A seleção e a prévia são locais à aba; **Aplicar tema** troca a página inicial do servidor. **Restaurar página original** recupera os bytes e as permissões da página nginx original pelo backup privado.

A publicação exige uma sessão do grupo administrador principal. Páginas personalizadas e índices alternativos são preservados. O navegador envia somente o identificador de um dos quatro modelos; o serviço não recebe HTML, caminhos, URLs ou comandos. A operação não muda portas, rotas, códigos de acesso ou configuração nginx e não reinicia nginx. O conteúdo é substituído de forma atômica.

## Instalação em painel existente

Na raiz do clone atualizado, execute como root:

```bash
sudo python3 scripts/instalar_atualizador.py --install
sudo python3 xui-naxx/atualizacao/aplicar.py --check
sudo python3 xui-naxx/atualizacao/aplicar.py
```

Se usar o pacote complementar, extraia o ZIP e execute na pasta extraída:

```bash
sudo python3 scripts/instalar_atualizador.py --install
sudo python3 atualizacao/aplicar.py --check
sudo python3 atualizacao/aplicar.py
```

O instalador instala os quatro modelos em `/usr/local/lib/naxx-public-page/themes`, o helper em `/usr/local/lib/naxx` e prepara o backup privado em `/var/lib/naxx-public-page` com acesso somente do root. Ele preserva a configuração e a preferência de atualização automática existentes e reinicia somente o serviço atualizador quando necessário. A instalação não publica um modelo automaticamente. Recarregue o painel e abra a nova aba.

O canal automático continua contendo exatamente os mesmos 19 destinos de interface; helper, modelos e unidade systemd são instalados pelo procedimento root acima. A edição permanece **1.14.2**, sobre XUI 1.5.12. Os anexos anteriores da edição permanecem disponíveis. Confira os hashes em `SHA256SUMS-pagina-publica`.
