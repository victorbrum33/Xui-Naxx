# NAXX Automático — 1.5.14.1

A nova opção analisa o formato e os codecs das fontes e escolhe um dos motores
nativos compatíveis. A escolha é feita ao salvar o canal e aparece abaixo do
seletor. Os modos manuais continuam disponíveis.

## Usar no painel

1. Edite um canal já cadastrado e abra **Servidores**.
2. Escolha pelo menos um **Servidor sob demanda**.
3. Em **Sob demanda com baixa latência**, selecione **NAXX Automático**.
4. Salve. O painel analisa a fonte principal e as reservas, grava o modo nativo
   escolhido e confirma o perfil automático.

Para um canal novo, salve o cadastro primeiro e reabra a edição. A primeira versão
não modifica a importação em lote. Ao alterar fontes, codecs ou parâmetros de
acesso, analise novamente. A seleção automática acontece no formulário; ela não
troca de motor durante uma reprodução nem monitora o canal continuamente.

## Combinações validadas

| Entrada H.264/AAC | Modo padrão | LLOD v2 — FFmpeg | LLOD v3 — PHP | Escolha automática |
| --- | ---: | ---: | ---: | --- |
| MPEG-TS por HTTP | 6,662 s | 3,413 s | 2,476 s | v3 — PHP |
| HLS | 2,613 s | 0,247 s | Falhou | v2 — FFmpeg |

São medições locais de uma rodada em 04/11/2026, com fontes sintéticas, canais
parados antes da solicitação e abertura pela prévia administrativa. O servidor da
fonte HLS já estava aquecido. O tempo termina no segmento reproduzível com áudio e
vídeo válidos; não representa o primeiro quadro no aplicativo nem valida todas
as contas de clientes, codecs, provedores ou servidores. Os objetos de teste
foram removidos e o canal existente foi preservado.

Nesta edição, somente H.264/AAC está validado para a seleção dos modos rápidos.
Fontes sem análise completa, formatos diferentes entre principal e reservas,
codecs sem validação, transcodificação, comando FFmpeg personalizado e atraso
configurado usam o modo convencional, com o motivo informado. Fontes diretas
usam o fluxo direto já existente, sem essa opção.

O perfil de segmentos de 2 segundos continua separado. O corte dos segmentos
depende dos quadros-chave da fonte, conforme a
[documentação do FFmpeg](https://ffmpeg.org/ffmpeg-formats.html#segment_002c-stream_005fsegment_002c-ssegment).

## Gravação e retorno ao modo manual

O núcleo recebe somente os valores nativos 0, 1 e 2. O perfil NAXX fica em uma
tabela própria e só é confirmado após a gravação nativa. A confirmação verifica
canal, identidade, fontes, servidores, opções de acesso e modo efetivo. A tabela
não guarda as URLs nem os dados de acesso em texto; usa uma assinatura desses
campos para detectar alterações.

Para voltar ao modo manual, escolha **Desativado**, **LLOD v2** ou **LLOD v3** e
salve. Os canais existentes mantêm sua configuração até uma alteração explícita.
Atualizar a interface não ativa o modo automático em todos os canais.

Administradores podem substituir as combinações locais por um objeto JSON em
`includes/naxx-ondemand-capabilities.json`. Um objeto vazio `{}` desativa a
seleção de motores rápidos; uma configuração inválida também a desativa.

## Atualização e versão

O pacote da edição **1.5.14.1** inclui a interface e o endpoint NAXX. Ele usa o
atualizador existente e seus backups, sem substituir o núcleo protegido.

Para manter a compatibilidade com serviços antigos, o canal anuncia
`version: "1.5.14"` junto de `release_version: "1.5.14.1"`. O hash identifica o
novo pacote. Serviços novos usam a edição completa; serviços antigos podem
registrar 1.5.14 no histórico, enquanto a interface instalada mostra 1.5.14.1.

Para atualizar o serviço de versões em uma cópia atual do repositório:

```bash
sudo python3 scripts/instalar_atualizador.py --install
```

O instalador preserva a preferência de atualização automática e recusa a
substituição do serviço enquanto uma atualização estiver em andamento.
