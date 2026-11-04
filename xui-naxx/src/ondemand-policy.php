<?php
// Política pura: não consulta fontes, banco, cache ou processos do painel.

/** Compatível com PHP 7.4: verifica uma lista com índices consecutivos. */
function naxxOdIsList(array $value) {
    return !$value || array_keys($value) === range(0, count($value) - 1);
}

/** Valida uma lista ou JSON de fontes, preservando URLs, ordem e duplicatas. */
function naxxOdNormalizeSources($input) {
    if (is_string($input)) {
        $json = trim($input);
        $input = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE || substr($json, 0, 1) !== '[') {
            return ['sources' => [], 'valid' => false, 'reason' => 'A lista de fontes não contém um JSON de lista válido.'];
        }
    }
    if (!is_array($input) || !naxxOdIsList($input) || !$input) {
        return ['sources' => [], 'valid' => false, 'reason' => 'Informe ao menos uma fonte em uma lista válida.'];
    }
    $sources = [];
    foreach ($input as $index => $source) {
        $label = 'A fonte ' . ($index + 1);
        if (!is_string($source) || trim($source) === '') {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' está vazia ou não é um endereço de texto.'];
        }
        $source = trim($source);
        if (preg_match('/[\x00-\x20\x7f]/', $source)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' contém espaços ou caracteres de controle.'];
        }
        $parts = parse_url($source);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' não tem protocolo e servidor válidos.'];
        }
        if (!in_array(strtolower($parts['scheme']), ['http', 'https', 'rtsp', 'udp'], true)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' usa protocolo não permitido. Use HTTP, HTTPS, RTSP ou UDP.'];
        }
        $host = $parts['host'];
        if (strpos($host, '[') !== false || strpos($host, ']') !== false) {
            $validHost = substr($host, 0, 1) === '[' && substr($host, -1) === ']'
                && filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
        } else {
            $validHost = filter_var($host, FILTER_VALIDATE_IP) !== false
                || filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
        }
        if (!$validHost) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' não tem um nome de servidor ou endereço IP válido.'];
        }
        if (isset($parts['port']) && ($parts['port'] < 1 || $parts['port'] > 65535)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' usa uma porta inválida.'];
        }
        $sources[] = $source;
    }
    return ['sources' => $sources, 'valid' => true, 'reason' => 'Lista de fontes válida; os endereços não foram acessados.'];
}

/** Ordena mapas recursivamente, mantendo listas e tipos para uma assinatura estável. */
function naxxOdCanonicalValue($value) {
    if (is_array($value)) {
        if (!naxxOdIsList($value)) ksort($value, SORT_STRING);
        foreach ($value as $key => $item) $value[$key] = naxxOdCanonicalValue($item);
        return $value;
    }
    if (is_scalar($value) || $value === null) return $value;
    throw new InvalidArgumentException('Os parâmetros da assinatura devem conter apenas arrays e valores escalares.');
}

/** SHA-256 das strings exatas e flags fornecidos; não devolve nem registra fontes. */
function naxxOdFingerprint(array $sources, array $flags = []) {
    if (!naxxOdIsList($sources)) throw new InvalidArgumentException('As fontes da assinatura devem formar uma lista.');
    foreach ($sources as $source) {
        if (!is_string($source)) throw new InvalidArgumentException('As fontes da assinatura devem ser textos.');
    }
    $json = json_encode(['sources' => $sources, 'flags' => naxxOdCanonicalValue($flags)],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false) throw new InvalidArgumentException('Não foi possível serializar os parâmetros da assinatura.');
    return hash('sha256', $json);
}

/** Interpreta valores usuais de formulários; valores não vazios desconhecidos são ativos. */
function naxxOdFlagEnabled($value) {
    if ($value === null || $value === false) return false;
    if (is_string($value)) {
        $value = trim($value);
        if (in_array(strtolower($value), ['', 'false', 'off', 'no'], true)) return false;
        if (is_numeric($value)) return (float) $value != 0;
        return true;
    }
    if (is_int($value) || is_float($value)) return $value != 0;
    if (is_array($value)) return count($value) > 0;
    return (bool) $value;
}

/** Classifica o resultado real de ffprobe, sem usar a extensão da URL. */
function naxxOdClassifyObservation($observation) {
    $result = ['format' => null, 'verified' => false, 'reason' => '', 'video_codecs' => [], 'audio_codecs' => []];
    if (is_string($observation)) {
        $json = trim($observation);
        $observation = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE || substr($json, 0, 1) !== '{') {
            $result['reason'] = 'A análise da fonte não contém um JSON de objeto válido.';
            return $result;
        }
    }
    if (!is_array($observation)) {
        $result['reason'] = 'A análise da fonte está ausente ou incompleta.';
        return $result;
    }
    if (naxxOdFlagEnabled($observation['timeout'] ?? false) || naxxOdFlagEnabled($observation['timed_out'] ?? false)) {
        $result['reason'] = 'A análise da fonte excedeu o tempo de espera.';
        return $result;
    }
    if (!empty($observation['error']) || (array_key_exists('ok', $observation) && $observation['ok'] !== true)
        || (isset($observation['exit_code']) && $observation['exit_code'] !== 0)) {
        $result['reason'] = 'A análise da fonte terminou com erro.';
        return $result;
    }
    $name = $observation['format']['format_name'] ?? null;
    if (!is_string($name) || trim($name) === '') {
        $result['reason'] = 'O formato real da fonte não foi identificado.';
        return $result;
    }
    $families = [
        'mpegts' => ['mpegts'], 'hls' => ['hls', 'applehttp'],
        'mp4' => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
        'matroska' => ['matroska', 'webm'], 'flv' => ['flv'], 'avi' => ['avi'],
        'mpeg' => ['mpeg'], 'ogg' => ['ogg'], 'rtsp' => ['rtsp'], 'rtp' => ['rtp'], 'sdp' => ['sdp']
    ];
    $found = [];
    foreach (explode(',', strtolower($name)) as $alias) {
        $alias = trim($alias);
        $family = null;
        foreach ($families as $candidate => $aliases) {
            if (in_array($alias, $aliases, true)) { $family = $candidate; break; }
        }
        if ($family === null) {
            $result['reason'] = 'A análise retornou um formato desconhecido para esta política.';
            return $result;
        }
        $found[$family] = true;
    }
    if (count($found) !== 1) {
        $result['reason'] = 'A análise retornou formatos incompatíveis entre si.';
        return $result;
    }
    $result['format'] = key($found);
    if (!isset($observation['streams']) || !is_array($observation['streams']) || !naxxOdIsList($observation['streams'])) {
        $result['reason'] = 'A análise não identificou os codecs de vídeo e áudio.';
        return $result;
    }
    foreach ($observation['streams'] as $stream) {
        if (!is_array($stream)) {
            $result['reason'] = 'A análise contém informações de mídia incompletas.';
            return $result;
        }
        $type = $stream['codec_type'] ?? null;
        if ($type !== 'video' && $type !== 'audio') continue;
        $codec = $stream['codec_name'] ?? null;
        if (!is_string($codec) || !preg_match('/^[a-z0-9_]+$/i', $codec) || in_array(strtolower($codec), ['unknown', 'none', 'n_a'], true)) {
            $result['reason'] = 'A análise contém um codec de vídeo ou áudio desconhecido.';
            return $result;
        }
        $key = $type === 'video' ? 'video_codecs' : 'audio_codecs';
        $result[$key][] = strtolower($codec);
    }
    if (!$result['video_codecs'] || !$result['audio_codecs']) {
        $result['reason'] = 'A análise precisa identificar ao menos um codec de vídeo e um de áudio.';
        return $result;
    }
    $result['video_codecs'] = array_values(array_unique($result['video_codecs']));
    $result['audio_codecs'] = array_values(array_unique($result['audio_codecs']));
    $result['verified'] = true;
    $result['reason'] = 'Formato e codecs de vídeo e áudio identificados pela análise.';
    return $result;
}

/** Capacidades: lista de modos ou mapa modes/video_codecs/audio_codecs por formato. */
function naxxOdDecide(array $sources, array $observations, array $flags = [], array $capabilities = [], array $preference = [2, 1, 0]) {
    $result = ['mode' => 0, 'reason' => '', 'format' => null, 'verified' => false];
    $normalized = naxxOdNormalizeSources($sources);
    if (!$normalized['valid']) { $result['reason'] = $normalized['reason']; return $result; }
    $incompatible = [
        'direct_source' => 'fonte direta', 'transcode' => 'transcodificação', 'transcode_profile_id' => 'perfil de transcodificação',
        'custom_ffmpeg' => 'comando FFmpeg personalizado', 'delay' => 'atraso configurado', 'delay_minutes' => 'atraso configurado'
    ];
    foreach ($incompatible as $key => $label) {
        if (naxxOdFlagEnabled($flags[$key] ?? null)) {
            $result['reason'] = 'Mantido o modo convencional: ' . $label . ' é incompatível com a seleção automática.';
            return $result;
        }
    }
    if (!naxxOdIsList($observations) || count($observations) !== count($normalized['sources'])) {
        $result['reason'] = 'Falta uma análise completa para cada fonte, incluindo as reservas.';
        return $result;
    }
    $formats = []; $videoCodecs = []; $audioCodecs = [];
    foreach ($observations as $index => $observation) {
        $classified = naxxOdClassifyObservation($observation);
        if (!$classified['verified']) {
            $result['reason'] = 'Fonte ' . ($index + 1) . ': ' . $classified['reason'];
            return $result;
        }
        $formats[$classified['format']] = true;
        $videoCodecs = array_merge($videoCodecs, $classified['video_codecs']);
        $audioCodecs = array_merge($audioCodecs, $classified['audio_codecs']);
    }
    if (count($formats) !== 1) {
        $result['reason'] = 'As fontes principal e reservas usam formatos diferentes; mantido o modo convencional.';
        return $result;
    }
    $result['format'] = key($formats);
    $capability = $capabilities[$result['format']] ?? null;
    $modes = $capability;
    if (is_array($capability) && !naxxOdIsList($capability)) {
        $modes = $capability['modes'] ?? null;
        foreach (['video_codecs' => $videoCodecs, 'audio_codecs' => $audioCodecs] as $key => $observed) {
            $whitelist = $capability[$key] ?? null;
            if (!is_array($whitelist) || !$whitelist || !naxxOdIsList($whitelist)) {
                $result['reason'] = 'A lista de codecs validados está incompleta; mantido o modo convencional.';
                return $result;
            }
            $allowed = [];
            foreach ($whitelist as $codec) {
                if (!is_string($codec) || !preg_match('/^[a-z0-9_]+$/i', $codec) || in_array(strtolower($codec), ['unknown', 'none', 'n_a'], true)) {
                    $result['reason'] = 'A lista de codecs validados é inválida; mantido o modo convencional.';
                    return $result;
                }
                $allowed[] = strtolower($codec);
            }
            if (array_diff($observed, $allowed)) {
                $result['reason'] = 'Há codecs de vídeo ou áudio sem validação em uma das fontes; mantido o modo convencional.';
                return $result;
            }
        }
    }
    if (!is_array($modes) || !$modes || !naxxOdIsList($modes)) {
        $result['reason'] = 'Não há modos validados para o formato identificado; mantido o modo convencional.';
        return $result;
    }
    foreach ([$modes, $preference] as $list) {
        if (!$list || !naxxOdIsList($list)) {
            $result['reason'] = 'A configuração de capacidades ou preferência é inválida; mantido o modo convencional.';
            return $result;
        }
        foreach ($list as $mode) {
            if (!is_int($mode) || !in_array($mode, [0, 1, 2], true)) {
                $result['reason'] = 'A configuração contém um modo não suportado; mantido o modo convencional.';
                return $result;
            }
        }
    }
    foreach ($preference as $mode) {
        if (!in_array($mode, $modes, true)) continue;
        $result['mode'] = $mode;
        $result['verified'] = true;
        $result['reason'] = $mode === 0
            ? 'Todas as fontes foram analisadas; o modo convencional foi selecionado conforme as capacidades validadas.'
            : 'Todas as fontes têm o mesmo formato e codecs identificados; selecionado o modo nativo ' . $mode . ' entre as capacidades validadas.';
        return $result;
    }
    $result['reason'] = 'Nenhum modo validado coincide com a preferência informada; mantido o modo convencional.';
    return $result;
}
