<?php
// Execute com PHP CLI; nenhuma fonte é acessada e nenhum estado é gravado.
require_once __DIR__ . '/../xui-naxx/src/ondemand-policy.php';

$naxxOdChecks = 0;
function naxxOdTest($condition, $message) {
    global $naxxOdChecks;
    $naxxOdChecks++;
    if (!$condition) throw new RuntimeException($message);
}
function naxxOdTestProbe($format, $video = 'h264', $audio = 'aac') {
    $streams = [];
    if ($video !== null) $streams[] = ['codec_type' => 'video', 'codec_name' => $video];
    if ($audio !== null) $streams[] = ['codec_type' => 'audio', 'codec_name' => $audio];
    return ['format' => ['format_name' => $format], 'streams' => $streams];
}
function naxxOdTestFallback($decision, $message) {
    naxxOdTest($decision['mode'] === 0 && $decision['verified'] === false, $message);
    naxxOdTest(is_string($decision['reason']) && strlen($decision['reason']) > 15, 'O fallback deve explicar o motivo.');
}

$sources = ['https://origem.example/sem-extensao?token=privado', 'http://reserva.example/parece.m3u8'];
$mpegts = naxxOdTestProbe('mpegts');
$hls = naxxOdTestProbe('hls,applehttp');
$mp4 = naxxOdTestProbe('mov,mp4,m4a,3gp,3g2,mj2');
$caps = ['mpegts' => [2, 1, 0], 'hls' => [1, 0], 'mp4' => [0]];

$normalized = naxxOdNormalizeSources(json_encode($sources));
naxxOdTest($normalized['valid'] && $normalized['sources'] === $sources, 'A lista JSON deve manter fontes e ordem.');
$withSpaces = naxxOdNormalizeSources(['  https://origem.example/entrada  ']);
naxxOdTest($withSpaces['sources'] === ['https://origem.example/entrada'], 'Remover apenas espaços externos.');
foreach (['http://host.example/live', 'https://host.example/live', 'rtsp://host.example:554/live', 'udp://@239.1.1.1:1234', 'http://[::1]:8080/live'] as $url) {
    naxxOdTest(naxxOdNormalizeSources([$url])['valid'], 'Protocolo permitido deveria passar pela validação local.');
}
foreach (['{', '{}', '"https://host.example"', 'null', '[]', '{"0":"https://host.example"}'] as $json) {
    naxxOdTest(!naxxOdNormalizeSources($json)['valid'], 'JSON malformado ou que não seja lista deve ser recusado.');
}
foreach ([[], [null], [123], [''], ['file:///etc/passwd'], ['ftp://host.example/live'], ['http:///invalid'], ['http://['], ['http://[bad]/'], ['http://.'], ['http://host..example'], ['https://host.example:0/live'], ["http://host.example/a\nb"], ['http://host.example/a b']] as $invalid) {
    naxxOdTest(!naxxOdNormalizeSources($invalid)['valid'], 'Fonte inválida deveria ser recusada.');
}

$flagsA = ['delay' => 0, 'transcode' => false, 'extra' => ['z' => 2, 'a' => 1]];
$flagsB = ['extra' => ['a' => 1, 'z' => 2], 'transcode' => false, 'delay' => 0];
$signature = naxxOdFingerprint($sources, $flagsA);
naxxOdTest(preg_match('/^[a-f0-9]{64}$/', $signature) === 1, 'A assinatura deve ser SHA-256 hexadecimal.');
naxxOdTest(strpos($signature, 'privado') === false && strpos($signature, 'example') === false, 'A assinatura não deve expor as fontes.');
naxxOdTest($signature === naxxOdFingerprint($sources, $flagsB), 'Ordenar as chaves dos flags de forma determinística.');
naxxOdTest($signature !== naxxOdFingerprint(array_reverse($sources), $flagsA), 'A ordem das fontes faz parte da assinatura.');
naxxOdTest($signature !== naxxOdFingerprint([$sources[0] . '&x=1', $sources[1]], $flagsA), 'A query exata faz parte da assinatura.');
naxxOdTest($signature !== naxxOdFingerprint($sources, array_merge($flagsA, ['delay' => 1])), 'Alterar flags deve invalidar a assinatura.');
naxxOdTest(naxxOdFingerprint(['https://host.example/%2f']) !== naxxOdFingerprint(['https://host.example/%2F']), 'Não reescrever a representação das fontes na assinatura.');
try { naxxOdFingerprint([123]); throw new RuntimeException('Era esperada a recusa de fonte não textual.'); }
catch (InvalidArgumentException $expected) { naxxOdTest(true, 'Entrada inválida recusada.'); }

foreach ([[$mpegts, 'mpegts'], [$hls, 'hls'], [$mp4, 'mp4']] as $case) {
    $classification = naxxOdClassifyObservation(json_encode($case[0]));
    naxxOdTest($classification['verified'] && $classification['format'] === $case[1], 'Classificar formato real e aliases ffprobe.');
    naxxOdTest($classification['video_codecs'] === ['h264'] && $classification['audio_codecs'] === ['aac'], 'Classificar codecs reais.');
}
$decision = naxxOdDecide($sources, [$mpegts, $mpegts], [], $caps);
naxxOdTest($decision['mode'] === 2 && $decision['format'] === 'mpegts' && $decision['verified'], 'A observação real deve prevalecer sobre extensão m3u8 da URL.');
$decision = naxxOdDecide(['https://host.example/parece.ts'], [$hls], [], $caps);
naxxOdTest($decision['mode'] === 1 && $decision['format'] === 'hls', 'HLS real não pode ser classificado pela extensão TS.');
$decision = naxxOdDecide([$sources[0]], [$mpegts], [], $caps, [1, 2, 0]);
naxxOdTest($decision['mode'] === 1, 'A preferência deve vir do chamador.');
$decision = naxxOdDecide([$sources[0]], [$hls], [], ['hls' => [2, 0]]);
naxxOdTest($decision['mode'] === 2, 'A política não deve impor uma matriz fixa para os modos 1 e 2.');
$decision = naxxOdDecide([$sources[0]], [$mp4], [], $caps);
naxxOdTest($decision['mode'] === 0 && $decision['verified'], 'Modo convencional explicitamente validado pode ser escolhido.');

foreach (['transcode', 'transcode_profile_id', 'custom_ffmpeg', 'direct_source', 'delay', 'delay_minutes'] as $flag) {
    $value = $flag === 'custom_ffmpeg' ? '-c:v libx264' : 1;
    naxxOdTestFallback(naxxOdDecide($sources, [$mpegts, $mpegts], [$flag => $value], $caps), 'Flags incompatíveis devem manter o modo convencional.');
}
naxxOdTest(naxxOdDecide([$sources[0]], [$mpegts], ['transcode' => 'false', 'direct_source' => 'off', 'delay' => '0.0', 'custom_ffmpeg' => ''], $caps)['mode'] === 2, 'Valores desativados de formulário não devem bloquear a seleção.');

$badObservations = [null, '', '{', '[]', ['timeout' => true], ['timed_out' => true], ['error' => ['code' => 1]],
    ['ok' => false], ['exit_code' => 1], [], naxxOdTestProbe('desconhecido'), naxxOdTestProbe('mpegts,hls'),
    naxxOdTestProbe('mpegts', null, 'aac'), naxxOdTestProbe('mpegts', 'h264', null),
    naxxOdTestProbe('mpegts', 'unknown', 'aac'), ['format' => ['format_name' => 'mpegts'], 'streams' => 'inválido']];
foreach ($badObservations as $observation) {
    naxxOdTestFallback(naxxOdDecide([$sources[0]], [$observation], [], $caps), 'Observação incompleta, desconhecida ou com erro deve cair para 0.');
}
naxxOdTestFallback(naxxOdDecide($sources, [$mpegts], [], $caps), 'É obrigatória uma observação por fonte reserva.');
naxxOdTestFallback(naxxOdDecide($sources, [$mpegts, $hls], [], $caps), 'Fontes com formatos mistos não podem ativar LLOD automaticamente.');
naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts]), 'Sem capacidades validadas, manter o modo convencional.');
naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], ['hls' => [1, 0]]), 'Capacidades de outro formato não autorizam aceleração.');
foreach ([[3], [2, 3, 0], ['2'], [true], '2', []] as $modes) {
    naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], ['mpegts' => $modes]), 'Capacidades inválidas nunca devem habilitar um modo.');
}
foreach ([[3], ['2'], [], [false]] as $preference) {
    naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], $caps, $preference), 'Preferência inválida nunca deve habilitar um modo.');
}
naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], ['mpegts' => [1]], [2]), 'Sem interseção explícita não deve inferir suporte.');

$structured = ['mpegts' => ['modes' => [2, 1, 0], 'video_codecs' => ['h264'], 'audio_codecs' => ['aac']]];
$decision = naxxOdDecide($sources, [$mpegts, $mpegts], [], $structured);
naxxOdTest($decision['mode'] === 2 && $decision['verified'], 'Capacidade estruturada deve autorizar apenas os codecs validados.');
foreach ([naxxOdTestProbe('mpegts', 'hevc', 'aac'), naxxOdTestProbe('mpegts', 'h264', 'ac3'), naxxOdTestProbe('mpegts', 'hevc', 'ac3')] as $otherCodecs) {
    naxxOdTestFallback(naxxOdDecide($sources, [$mpegts, $otherCodecs], [], $structured), 'Codecs não ensaiados em qualquer fonte reserva precisam cair para 0.');
}
$multipleAudio = $mpegts;
$multipleAudio['streams'][] = ['codec_type' => 'audio', 'codec_name' => 'ac3'];
naxxOdTestFallback(naxxOdDecide([$sources[0]], [$multipleAudio], [], $structured), 'Todos os codecs da fonte devem estar na lista validada.');
$withAC3 = $structured;
$withAC3['mpegts']['audio_codecs'][] = 'ac3';
naxxOdTest(naxxOdDecide([$sources[0]], [$multipleAudio], [], $withAC3)['mode'] === 2, 'Múltiplos codecs só podem passar quando todos foram validados.');
foreach (['video_codecs', 'audio_codecs'] as $key) {
    foreach ([null, [], 'h264', [123], ['unknown'], [' h264'], ['x' => 'h264']] as $invalid) {
        $badCapability = $structured;
        $badCapability['mpegts'][$key] = $invalid;
        naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], $badCapability), 'Lista de codecs inválida precisa manter o fallback conservador.');
    }
    $missingCapability = $structured;
    unset($missingCapability['mpegts'][$key]);
    naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], $missingCapability), 'Listas estruturadas de codecs são obrigatórias.');
}
$badMode = $structured; $badMode['mpegts']['modes'] = [3];
naxxOdTestFallback(naxxOdDecide([$sources[0]], [$mpegts], [], $badMode), 'Capacidade estruturada também nunca pode autorizar modo 3.');

// Varredura dos caminhos de seleção: o contrato nunca emite 3 ou modo de tipo errado.
foreach ([$mpegts, $hls, $mp4, null] as $observation) {
    foreach ([[], $caps, ['mpegts' => [3]], ['mpegts' => [2]]] as $capabilities) {
        $decision = naxxOdDecide([$sources[0]], [$observation], [], $capabilities);
        naxxOdTest(in_array($decision['mode'], [0, 1, 2], true), 'A política nunca pode emitir um motor novo ou não inteiro.');
        naxxOdTest(array_keys($decision) === ['mode', 'reason', 'format', 'verified'], 'Contrato de decisão deve permanecer explícito.');
        naxxOdTest(strpos($decision['reason'], 'privado') === false && strpos($decision['reason'], 'example') === false, 'Motivos não devem expor endereços de fontes.');
    }
}

echo 'Política on-demand: ' . $naxxOdChecks . " verificações passaram; sem rede ou efeitos no painel.\n";
