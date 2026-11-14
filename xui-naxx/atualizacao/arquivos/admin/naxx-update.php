<?php
if (($_GET['feature'] ?? '') === 'public-page') {

// Página pública: somente modelos locais previamente instalados pelo serviço root.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(15);
$naxxPublicResponded = false;
$naxxPublicCheckingAccess = true;

function naxxPublicReply($status, array $payload) {
    $GLOBALS['naxxPublicResponded'] = true;
    while (ob_get_level() && ob_end_clean()) {}
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function naxxPublicOrigin($value) {
    $parts = parse_url((string) $value);
    if (!$parts || !isset($parts['scheme'], $parts['host']) || isset($parts['user']) || isset($parts['pass'])) return '';
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) return '';
    return $scheme . '://' . strtolower($parts['host']) . ':' . ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
}

function naxxPublicNativeAdmin(array $variables) {
    $found = false;
    foreach ($variables as $name => $group) {
        if (in_array($name, ['GLOBALS', '_GET', '_POST', '_REQUEST', '_SERVER', '_COOKIE', '_FILES', '_SESSION', '_ENV'], true) ||
                !is_array($group) || !isset($group['is_admin'], $group['is_reseller'], $group['group_id'])) continue;
        if (!in_array($group['is_admin'], [1, '1'], true) || !in_array($group['is_reseller'], [0, '0'], true) ||
                !in_array($group['group_id'], [1, '1'], true)) return false;
        $found = true;
    }
    return $found;
}

register_shutdown_function(function () {
    if (empty($GLOBALS['naxxPublicResponded'])) naxxPublicReply(empty($GLOBALS['naxxPublicCheckingAccess']) ? 503 : 403,
        ['ok' => false, 'message' => empty($GLOBALS['naxxPublicCheckingAccess']) ?
            'Não foi possível consultar a página pública.' : 'Entre com uma conta do grupo administrador principal.']);
});

$naxxPublicMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($naxxPublicMethod, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    naxxPublicReply(405, ['ok' => false, 'message' => 'Método de página pública inválido.']);
}
$naxxPublicScheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
$naxxPublicExpected = naxxPublicOrigin($naxxPublicScheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
$naxxPublicOrigin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!$naxxPublicExpected || strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' ||
        ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site' ||
        ($naxxPublicMethod === 'POST' && naxxPublicOrigin($naxxPublicOrigin) !== $naxxPublicExpected) ||
        ($naxxPublicOrigin !== '' && naxxPublicOrigin($naxxPublicOrigin) !== $naxxPublicExpected)) {
    naxxPublicReply(403, ['ok' => false, 'message' => 'Abra a aba Página pública no painel para continuar.']);
}
$naxxPublicRequest = [];
if ($naxxPublicMethod === 'POST') {
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        naxxPublicReply(400, ['ok' => false, 'message' => 'Envie a solicitação em JSON.']);
    }
    $naxxPublicInput = file_get_contents('php://input', false, null, 0, 2049);
    $naxxPublicRequest = json_decode($naxxPublicInput, true);
    if (!is_array($naxxPublicRequest) || strlen((string) $naxxPublicInput) > 2048 ||
            array_diff(array_keys($naxxPublicRequest), ['action', 'theme', 'csrf'])) {
        naxxPublicReply(400, ['ok' => false, 'message' => 'A solicitação de página pública é inválida.']);
    }
}
$naxxPublicThemes = ['naxx', 'aurora', 'claro', 'cinema'];
$naxxPublicPreview = $_GET['preview'] ?? null;
$naxxPublicAction = $naxxPublicMethod === 'GET' ? ($naxxPublicPreview === null ? 'status' : 'preview') : ($naxxPublicRequest['action'] ?? '');
$naxxPublicTheme = $naxxPublicMethod === 'GET' ? $naxxPublicPreview : ($naxxPublicRequest['theme'] ?? null);
if (($naxxPublicMethod === 'POST' && !in_array($naxxPublicAction, ['publish', 'restore'], true)) ||
        (in_array($naxxPublicAction, ['publish', 'preview'], true) && (!is_string($naxxPublicTheme) || !in_array($naxxPublicTheme, $naxxPublicThemes, true))) ||
        ($naxxPublicAction === 'restore' && $naxxPublicTheme !== null)) {
    naxxPublicReply(400, ['ok' => false, 'message' => 'Selecione um dos quatro modelos disponíveis.']);
}

// Autenticação nativa e grupo principal. Nenhum parâmetro chega ao núcleo.
$naxxPublicSavedGet = $_GET;
$naxxPublicSavedPost = $_POST;
$naxxPublicSavedRequest = $_REQUEST;
$_GET = $_POST = $_REQUEST = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$naxxPublicAllowed = false;
$naxxPublicTail = '';
$naxxPublicBufferLevel = ob_get_level();
ob_start(function ($chunk) use (&$naxxPublicAllowed, &$naxxPublicTail) {
    $sample = $naxxPublicTail . $chunk;
    if (preg_match('/<input\b[^>]*\bid\s*=\s*[\x22\x27]server_name[\x22\x27][^>]*\bname\s*=\s*[\x22\x27]server_name[\x22\x27]/i', $sample)) $naxxPublicAllowed = true;
    $naxxPublicTail = substr($sample, -512);
    return '';
}, 8192);
$naxxPublicBefore = array_fill_keys(array_keys(get_defined_vars()), true);
require __DIR__ . '/settings.php';
$naxxPublicNative = array_diff_key(get_defined_vars(), $naxxPublicBefore);
while (ob_get_level() > $naxxPublicBufferLevel && ob_end_flush()) {}
$_GET = $naxxPublicSavedGet;
$_POST = $naxxPublicSavedPost;
$_REQUEST = $naxxPublicSavedRequest;
$_SERVER['REQUEST_METHOD'] = $naxxPublicMethod;
$naxxPublicRedirect = false;
foreach (headers_list() as $naxxPublicHeader) if (stripos($naxxPublicHeader, 'Location:') === 0) $naxxPublicRedirect = true;
if (!$naxxPublicAllowed || $naxxPublicRedirect || http_response_code() >= 300 || !naxxPublicNativeAdmin($naxxPublicNative)) {
    naxxPublicReply(403, ['ok' => false, 'message' => 'Entre com uma conta do grupo administrador principal.']);
}
$naxxPublicCheckingAccess = false;
if (session_status() !== PHP_SESSION_ACTIVE && session_id() !== '') @session_start();
if (session_status() !== PHP_SESSION_ACTIVE) naxxPublicReply(503, ['ok' => false, 'message' => 'Entre novamente no painel para validar a sessão.']);
if (!isset($_SESSION['naxx_public_page_csrf']) || !is_string($_SESSION['naxx_public_page_csrf']) || strlen($_SESSION['naxx_public_page_csrf']) !== 64) {
    $_SESSION['naxx_public_page_csrf'] = bin2hex(random_bytes(32));
}
$naxxPublicCsrf = $_SESSION['naxx_public_page_csrf'];
if ($naxxPublicMethod === 'POST' && (!is_string($naxxPublicRequest['csrf'] ?? null) || !hash_equals($naxxPublicCsrf, $naxxPublicRequest['csrf']))) {
    naxxPublicReply(403, ['ok' => false, 'message' => 'A sessão expirou. Recarregue a aba Página pública.']);
}
session_write_close();
$naxxPublicCommand = ['action' => 'public_page_' . $naxxPublicAction];
if ($naxxPublicTheme !== null) $naxxPublicCommand['theme'] = $naxxPublicTheme;
$naxxPublicSocket = @stream_socket_client('unix:///run/naxx-update/control.sock', $naxxPublicErrno, $naxxPublicError, 2, STREAM_CLIENT_CONNECT);
if (!$naxxPublicSocket) naxxPublicReply(503, ['ok' => false, 'csrf' => $naxxPublicCsrf, 'service_unavailable' => true, 'message' => 'O serviço local da página pública ainda não está disponível.']);
stream_set_timeout($naxxPublicSocket, 4);
$naxxPublicMessage = json_encode($naxxPublicCommand) . "\n";
if (fwrite($naxxPublicSocket, $naxxPublicMessage) !== strlen($naxxPublicMessage)) {
    fclose($naxxPublicSocket);
    naxxPublicReply(503, ['ok' => false, 'csrf' => $naxxPublicCsrf, 'message' => 'Não foi possível enviar a solicitação ao serviço local.']);
}
$naxxPublicRaw = fgets($naxxPublicSocket, 1048577);
$naxxPublicSocketMeta = stream_get_meta_data($naxxPublicSocket);
fclose($naxxPublicSocket);
$naxxPublicResponse = is_string($naxxPublicRaw) && strlen($naxxPublicRaw) <= 1048576 ? json_decode($naxxPublicRaw, true) : null;
if ($naxxPublicSocketMeta['timed_out'] || !is_array($naxxPublicResponse) || !isset($naxxPublicResponse['ok'])) {
    naxxPublicReply(503, ['ok' => false, 'csrf' => $naxxPublicCsrf, 'message' => 'O serviço local não respondeu. Recarregue o estado antes de tentar novamente.']);
}
$naxxPublicResponse['csrf'] = $naxxPublicCsrf;
$naxxPublicStatus = !empty($naxxPublicResponse['ok']) ? 200 : (int) ($naxxPublicResponse['status'] ?? 500);
if (!in_array($naxxPublicStatus, [200, 400, 403, 409, 500, 503], true)) $naxxPublicStatus = 500;
unset($naxxPublicResponse['status']);
naxxPublicReply($naxxPublicStatus, $naxxPublicResponse);

}

if (($_GET['feature'] ?? '') === 'ondemand') {

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


// Perfil automático por canal. Embutido no endpoint administrativo pelo build.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(25);
$naxxOdResponded = false;
$naxxOdAuthPhase = true;

function naxxOdReply($status, $payload) {
    $GLOBALS['naxxOdResponded'] = true;
    while (ob_get_level()) ob_end_clean();
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location'); header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function naxxOdOrigin($value) {
    $parts = parse_url((string) $value);
    if (!$parts || empty($parts['host']) || !in_array(strtolower($parts['scheme'] ?? ''), array('http', 'https'), true)) return '';
    $scheme = strtolower($parts['scheme']);
    return $scheme . '://' . strtolower($parts['host']) . ':' . ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
}

/** O bootstrap nativo pode converter enums da sessão em strings; outros tipos não são válidos. */
function naxxOdSessionMode($value) {
    if (is_int($value) && in_array($value, array(0, 1, 2), true)) return $value;
    if (is_string($value) && preg_match('/^[012]$/D', $value)) return (int) $value;
    return null;
}

function naxxOdRow($pdo, $id, $lock = false) {
    $query = $pdo->prepare('SELECT id, uuid, stream_source, llod, enable_transcode, transcode_profile_id, custom_ffmpeg, direct_source, delay_minutes FROM streams WHERE id = ? AND type = 1' . ($lock ? ' FOR UPDATE' : ''));
    $query->execute(array($id));
    $row = $query->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('missing_stream');
    return $row;
}

function naxxOdServers($pdo, $id) {
    $query = $pdo->prepare('SELECT DISTINCT server_id FROM streams_servers WHERE stream_id = ? AND on_demand = 1 ORDER BY server_id');
    $query->execute(array($id));
    return array_map('intval', $query->fetchAll(PDO::FETCH_COLUMN));
}

function naxxOdFetchOptions($pdo, $id) {
    $options = array('user_agent' => '', 'proxy' => '', 'cookie' => '', 'headers' => '');
    $query = $pdo->prepare("SELECT a.argument_key, a.argument_default_value, o.value FROM streams_arguments a LEFT JOIN streams_options o ON o.argument_id = a.id AND o.stream_id = ? WHERE a.argument_cat = 'fetch' AND a.argument_key IN ('user_agent', 'proxy', 'cookie', 'headers') ORDER BY a.id, o.id");
    $query->execute(array($id));
    foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $argument) {
        $key = $argument['argument_key'];
        if (array_key_exists($key, $options)) $options[$key] = trim((string) ($argument['value'] !== null ? $argument['value'] : $argument['argument_default_value']));
    }
    return $options;
}

function naxxOdFlags($row, $servers, $fetch) {
    return array('transcode' => !empty($row['enable_transcode']) || (int) ($row['transcode_profile_id'] ?? 0) > 0,
        'custom_ffmpeg' => trim((string) ($row['custom_ffmpeg'] ?? '')),
        'direct_source' => !empty($row['direct_source']),
        'delay' => (int) ($row['delay_minutes'] ?? 0), 'on_demand_servers' => $servers, 'fetch' => $fetch);
}

function naxxOdSnapshot($pdo, $row) {
    $sources = naxxOdNormalizeSources($row['stream_source']);
    $servers = naxxOdServers($pdo, (int) $row['id']);
    $flags = naxxOdFlags($row, $servers, naxxOdFetchOptions($pdo, (int) $row['id']));
    return array('hash' => $sources['valid'] ? naxxOdFingerprint($sources['sources'], $flags) : '',
        'flags' => $flags, 'servers' => $servers);
}

function naxxOdLoadProfile($pdo, $id) {
    try {
        $query = $pdo->prepare('SELECT * FROM naxx_ondemand_profiles WHERE stream_id = ?');
        $query->execute(array($id));
        return $query->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '42S02') return null;
        throw $error;
    }
}

function naxxOdPublicProfile($profile, $row, $snapshot) {
    $active = $profile && (string) $profile['stream_uuid'] === (string) ($row['uuid'] ?? '') &&
        $snapshot['hash'] !== '' && hash_equals((string) $profile['source_hash'], $snapshot['hash']) &&
        (int) $profile['effective_mode'] === (int) $row['llod'];
    return array('active' => (bool) $active, 'mode' => (int) $row['llod'],
        'previous_mode' => $active ? (int) $profile['previous_mode'] : (int) $row['llod'],
        'reason' => $active ? (string) $profile['reason'] : '',
        'format' => $active ? (string) $profile['format_name'] : '',
        'verified' => $active && !empty($profile['verified']));
}

function naxxOdEnsureTable($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS naxx_ondemand_profiles (
        stream_id INT NOT NULL PRIMARY KEY, stream_uuid VARCHAR(64) NOT NULL DEFAULT '',
        source_hash CHAR(64) NOT NULL, effective_mode TINYINT UNSIGNED NOT NULL,
        previous_mode TINYINT UNSIGNED NOT NULL, reason VARCHAR(255) NOT NULL,
        format_name VARCHAR(32) NOT NULL DEFAULT '', verified TINYINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/** Só exporta modos e codecs, nunca outros campos de um arquivo de configuração. */
function naxxOdCapabilitiesFile($path) {
    if (!is_string($path) || $path === '' || !is_file($path) || !is_readable($path)) return array();
    $raw = @file_get_contents($path, false, null, 0, 65537);
    if (!is_string($raw) || strlen($raw) > 65536 || substr(ltrim($raw), 0, 1) !== '{') return array();
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) return array();
    $result = array();
    foreach ($data as $format => $capability) {
        if (!in_array($format, array('mpegts', 'hls', 'mp4', 'matroska', 'flv', 'avi', 'mpeg', 'ogg', 'rtsp', 'rtp', 'sdp'), true) || !is_array($capability)) return array();
        $structured = !naxxOdIsList($capability);
        $modes = $structured ? ($capability['modes'] ?? null) : $capability;
        if (!is_array($modes) || !$modes || !naxxOdIsList($modes)) return array();
        foreach ($modes as $mode) if (!is_int($mode) || !in_array($mode, array(0, 1, 2), true)) return array();
        if (!$structured) { $result[$format] = $modes; continue; }
        if (array_diff(array_keys($capability), array('modes', 'video_codecs', 'audio_codecs'))) return array();
        $entry = array('modes' => $modes);
        foreach (array('video_codecs', 'audio_codecs') as $key) {
            $codecs = $capability[$key] ?? null;
            if (!is_array($codecs) || !$codecs || !naxxOdIsList($codecs)) return array();
            foreach ($codecs as $codec) if (!is_string($codec) || !preg_match('/^[a-z0-9_]+$/i', $codec) || in_array(strtolower($codec), array('unknown', 'none', 'n_a'), true)) return array();
            $entry[$key] = array_map('strtolower', $codecs);
        }
        $result[$format] = $entry;
    }
    return $result;
}

/** Um override explícito, inclusive {}, tem precedência sobre os ensaios da base 1.5.12. */
function naxxOdLoadCapabilities() {
    $env = getenv('NAXX_OD_CAPABILITIES');
    if (is_string($env) && $env !== '') return naxxOdCapabilitiesFile($env);
    foreach (array(dirname(__DIR__) . '/includes/naxx-ondemand-capabilities.json', __DIR__ . '/naxx-ondemand-capabilities.json') as $path) {
        if (file_exists($path) || is_link($path)) return naxxOdCapabilitiesFile($path);
    }
    // Ensaios nativos: TS validou 0/1/2; HLS validou 0/1 e recusou 2. Somente H.264/AAC.
    return array('mpegts' => array('modes' => array(0, 1, 2), 'video_codecs' => array('h264'), 'audio_codecs' => array('aac')),
        'hls' => array('modes' => array(0, 1), 'video_codecs' => array('h264'), 'audio_codecs' => array('aac')));
}

register_shutdown_function(function () {
    if (empty($GLOBALS['naxxOdResponded'])) naxxOdReply(!empty($GLOBALS['naxxOdAuthPhase']) ? 403 : 500,
        array('ok' => false, 'message' => !empty($GLOBALS['naxxOdAuthPhase'])
            ? 'Entre com uma conta autorizada a editar este canal.'
            : 'Não foi possível concluir a configuração automática.'));
});

$naxxOdMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($naxxOdMethod, array('GET', 'POST'), true)) {
    header('Allow: GET, POST'); naxxOdReply(405, array('ok' => false, 'message' => 'Método inválido.'));
}
$naxxOdRequest = array();
if ($naxxOdMethod === 'POST') {
    $naxxOdScheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    $naxxOdExpectedOrigin = naxxOdOrigin($naxxOdScheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
    if (!$naxxOdExpectedOrigin || naxxOdOrigin($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '')) !== $naxxOdExpectedOrigin ||
        strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        naxxOdReply(403, array('ok' => false, 'message' => 'Abra o canal no painel e tente novamente.'));
    }
    $naxxOdBody = file_get_contents('php://input', false, null, 0, 65537);
    $naxxOdRequest = json_decode($naxxOdBody, true);
    if (strlen((string) $naxxOdBody) > 65536 || !is_array($naxxOdRequest)) naxxOdReply(400, array('ok' => false, 'message' => 'Solicitação inválida.'));
}
$naxxOdIdValue = $naxxOdMethod === 'POST' ? ($naxxOdRequest['id'] ?? null) : ($_GET['id'] ?? null);
if ((!is_string($naxxOdIdValue) && !is_int($naxxOdIdValue)) || !preg_match('/^[1-9][0-9]{0,9}$/', (string) $naxxOdIdValue)) {
    naxxOdReply(400, array('ok' => false, 'message' => 'Salve o canal antes de configurar o modo automático.'));
}
$naxxOdId = (int) $naxxOdIdValue;

// O formulário nativo continua sendo a autoridade sobre acesso ao canal.
$naxxOdSavedGet = $_GET; $naxxOdSavedPost = $_POST; $naxxOdSavedRequest = $_REQUEST;
$_GET = array('id' => $naxxOdId); $_POST = array(); $_REQUEST = $_GET;
$_SERVER['REQUEST_METHOD'] = 'GET';
$naxxOdNativeTail = ''; $naxxOdNativeSelect = false; $naxxOdNativeId = false;
ob_start(function ($chunk) use (&$naxxOdNativeTail, &$naxxOdNativeSelect, &$naxxOdNativeId, $naxxOdId) {
    $sample = $naxxOdNativeTail . $chunk;
    if (preg_match('/<select\b[^>]*\bid\s*=\s*[\x22\x27]llod[\x22\x27]/i', $sample)) $naxxOdNativeSelect = true;
    if (preg_match('/<input\b[^>]*\bname\s*=\s*[\x22\x27]edit[\x22\x27][^>]*>/i', $sample, $match) &&
        preg_match('/\bvalue\s*=\s*[\x22\x27]([0-9]+)[\x22\x27]/i', $match[0], $value) && (int) $value[1] === $naxxOdId) $naxxOdNativeId = true;
    $naxxOdNativeTail = substr($sample, -2048);
    return '';
}, 8192);
require __DIR__ . '/stream.php';
ob_end_flush();
$_GET = $naxxOdSavedGet; $_POST = $naxxOdSavedPost; $_REQUEST = $naxxOdSavedRequest;
$_SERVER['REQUEST_METHOD'] = $naxxOdMethod;
$naxxOdRedirect = false;
foreach (headers_list() as $naxxOdHeader) if (stripos($naxxOdHeader, 'Location:') === 0) $naxxOdRedirect = true;
if (!$naxxOdNativeSelect || !$naxxOdNativeId || $naxxOdRedirect || http_response_code() >= 300) {
    naxxOdReply(403, array('ok' => false, 'message' => 'Entre com uma conta autorizada a editar este canal.'));
}
$naxxOdAuthPhase = false;
if (session_status() !== PHP_SESSION_ACTIVE && session_id() !== '') @session_start();
if (session_status() !== PHP_SESSION_ACTIVE) naxxOdReply(503, array('ok' => false, 'message' => 'Recarregue a página para validar sua sessão.'));
if (!isset($_SESSION['naxx_od_csrf']) || !is_string($_SESSION['naxx_od_csrf']) || strlen($_SESSION['naxx_od_csrf']) !== 64) $_SESSION['naxx_od_csrf'] = bin2hex(random_bytes(32));
$naxxOdCsrf = $_SESSION['naxx_od_csrf'];
if ($naxxOdMethod === 'POST' && (!is_string($naxxOdRequest['csrf'] ?? null) || !hash_equals($naxxOdCsrf, $naxxOdRequest['csrf']))) {
    naxxOdReply(403, array('ok' => false, 'message' => 'A sessão expirou. Recarregue o canal.'));
}
$naxxOdDatabase = null;
foreach (get_defined_vars() as $naxxOdVariable) {
    if (is_object($naxxOdVariable) && get_class($naxxOdVariable) === 'Database') { $naxxOdDatabase = $naxxOdVariable; break; }
}
if (!$naxxOdDatabase || !isset($naxxOdDatabase->dbh) || !($naxxOdDatabase->dbh instanceof PDO)) {
    naxxOdReply(503, array('ok' => false, 'message' => 'Não foi possível consultar o canal.'));
}
$naxxOdPdo = $naxxOdDatabase->dbh;
$naxxOdPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
// Somente motores aprovados pelos ensaios desta versão. Não há valor nativo 3.
$naxxOdCapabilities = naxxOdLoadCapabilities(); // NAXX_OD_VALIDATED_CAPABILITIES
$naxxOdAction = $naxxOdMethod === 'GET' ? 'status' : ($naxxOdRequest['action'] ?? '');

try {
    $naxxOdRow = naxxOdRow($naxxOdPdo, $naxxOdId);
    if (!in_array((int) $naxxOdRow['llod'], array(0, 1, 2), true)) throw new RuntimeException('unsupported_mode');
    $naxxOdSnapshot = naxxOdSnapshot($naxxOdPdo, $naxxOdRow);
    $naxxOdStored = naxxOdLoadProfile($naxxOdPdo, $naxxOdId);
    $naxxOdProfile = naxxOdPublicProfile($naxxOdStored, $naxxOdRow, $naxxOdSnapshot);
    if ($naxxOdAction === 'status') {
        naxxOdReply(200, array('ok' => true, 'feature' => 'ondemand', 'csrf' => $naxxOdCsrf,
            'capabilities' => $naxxOdCapabilities, 'native' => array('mode' => (int) $naxxOdRow['llod'],
                'on_demand_servers' => $naxxOdSnapshot['servers']), 'profile' => $naxxOdProfile));
    }
    if ($naxxOdAction === 'plan') {
        $naxxOdDraft = $naxxOdRequest['draft'] ?? null;
        if (!is_array($naxxOdDraft) || !is_array($naxxOdDraft['flags'] ?? null) || !is_array($naxxOdDraft['on_demand_servers'] ?? null)) {
            naxxOdReply(400, array('ok' => false, 'message' => 'As opções do canal estão incompletas.'));
        }
        $naxxOdSources = naxxOdNormalizeSources($naxxOdDraft['sources'] ?? null);
        if (!$naxxOdSources['valid'] || count($naxxOdSources['sources']) > 32) naxxOdReply(400, array('ok' => false, 'message' => 'Revise as fontes do canal.'));
        $naxxOdServers = array();
        foreach ($naxxOdDraft['on_demand_servers'] as $naxxOdServer) {
            if ((!is_int($naxxOdServer) && !is_string($naxxOdServer)) || !preg_match('/^[1-9][0-9]{0,9}$/', (string) $naxxOdServer)) {
                naxxOdReply(400, array('ok' => false, 'message' => 'Revise os servidores sob demanda.'));
            }
            $naxxOdServers[] = (int) $naxxOdServer;
        }
        $naxxOdServers = array_values(array_unique($naxxOdServers)); sort($naxxOdServers, SORT_NUMERIC);
        if (!$naxxOdServers) naxxOdReply(400, array('ok' => false, 'message' => 'Escolha pelo menos um servidor sob demanda.'));
        $naxxOdFlags = $naxxOdDraft['flags'];
        if (!is_bool($naxxOdFlags['transcode'] ?? null) || !is_bool($naxxOdFlags['direct_source'] ?? null) ||
            !is_string($naxxOdFlags['custom_ffmpeg'] ?? null) || strlen($naxxOdFlags['custom_ffmpeg']) > 16384 ||
            !is_int($naxxOdFlags['delay'] ?? null) || $naxxOdFlags['delay'] < 0 || $naxxOdFlags['delay'] > 1440) {
            naxxOdReply(400, array('ok' => false, 'message' => 'As opções de processamento estão inválidas.'));
        }
        $naxxOdFlags = array('transcode' => $naxxOdFlags['transcode'], 'custom_ffmpeg' => trim($naxxOdFlags['custom_ffmpeg']),
            'direct_source' => $naxxOdFlags['direct_source'], 'delay' => $naxxOdFlags['delay'], 'on_demand_servers' => $naxxOdServers);
        $naxxOdFetch = $naxxOdDraft['flags']['fetch'] ?? $naxxOdSnapshot['flags']['fetch'];
        if (!is_array($naxxOdFetch) || array_diff(array_keys($naxxOdFetch), array('user_agent', 'proxy', 'cookie', 'headers'))) naxxOdReply(400, array('ok' => false, 'message' => 'As opções de acesso à fonte estão inválidas.'));
        $naxxOdFlags['fetch'] = array();
        foreach (array('user_agent', 'proxy', 'cookie', 'headers') as $naxxOdFetchKey) {
            if (!is_string($naxxOdFetch[$naxxOdFetchKey] ?? null) || strlen($naxxOdFetch[$naxxOdFetchKey]) > 16384) naxxOdReply(400, array('ok' => false, 'message' => 'As opções de acesso à fonte estão inválidas.'));
            $naxxOdFlags['fetch'][$naxxOdFetchKey] = trim($naxxOdFetch[$naxxOdFetchKey]);
        }
        if ($naxxOdFlags['direct_source']) naxxOdReply(400, array('ok' => false, 'message' => 'O modo automático requer retransmissão pelo servidor.'));
        $naxxOdObservations = $naxxOdRequest['observations'] ?? array();
        if (!is_array($naxxOdObservations) || count($naxxOdObservations) > 3) naxxOdReply(400, array('ok' => false, 'message' => 'A análise das fontes está inválida.'));
        $naxxOdDecision = naxxOdDecide($naxxOdSources['sources'], $naxxOdObservations, $naxxOdFlags, $naxxOdCapabilities);
        $naxxOdNonce = bin2hex(random_bytes(32));
        if (!isset($_SESSION['naxx_od_plans']) || !is_array($_SESSION['naxx_od_plans'])) $_SESSION['naxx_od_plans'] = array();
        foreach ($_SESSION['naxx_od_plans'] as $naxxOdKey => $naxxOdOld) if (!is_array($naxxOdOld) || ($naxxOdOld['created'] ?? 0) < time() - 300) unset($_SESSION['naxx_od_plans'][$naxxOdKey]);
        if (count($_SESSION['naxx_od_plans']) >= 8 && !isset($_SESSION['naxx_od_plans'][(string) $naxxOdId])) {
            $naxxOdPlanKeys = array_keys($_SESSION['naxx_od_plans']);
            unset($_SESSION['naxx_od_plans'][$naxxOdPlanKeys[0]]);
        }
        $_SESSION['naxx_od_plans'][(string) $naxxOdId] = array('nonce' => $naxxOdNonce, 'created' => time(),
            'uuid' => (string) ($naxxOdRow['uuid'] ?? ''), 'hash' => naxxOdFingerprint($naxxOdSources['sources'], $naxxOdFlags),
            'mode' => (int) $naxxOdDecision['mode'], 'previous_mode' => $naxxOdProfile['previous_mode'],
            'reason' => $naxxOdDecision['reason'], 'format' => $naxxOdDecision['format'] ?? '', 'verified' => $naxxOdDecision['verified']);
        naxxOdReply(200, array('ok' => true, 'csrf' => $naxxOdCsrf, 'plan' => array('nonce' => $naxxOdNonce,
            'mode' => (int) $naxxOdDecision['mode'], 'reason' => $naxxOdDecision['reason'],
            'format' => $naxxOdDecision['format'], 'verified' => $naxxOdDecision['verified'])));
    }
    if ($naxxOdAction === 'commit') {
        $naxxOdPlan = $_SESSION['naxx_od_plans'][(string) $naxxOdId] ?? null;
        if (!is_array($naxxOdPlan) || ($naxxOdPlan['created'] ?? 0) < time() - 300 ||
            !is_string($naxxOdRequest['nonce'] ?? null) || !hash_equals($naxxOdPlan['nonce'], $naxxOdRequest['nonce'])) {
            naxxOdReply(409, array('ok' => false, 'message' => 'A análise expirou ou foi substituída. Analise o canal novamente.'));
        }
        $naxxOdPlanMode = naxxOdSessionMode($naxxOdPlan['mode'] ?? null);
        $naxxOdPreviousMode = naxxOdSessionMode($naxxOdPlan['previous_mode'] ?? null);
        if ($naxxOdPlanMode === null || $naxxOdPreviousMode === null) {
            naxxOdReply(409, array('ok' => false, 'conflict' => 'mode',
                'message' => 'O modo da análise está inválido. Analise o canal novamente.'));
        }
        $naxxOdPlan['mode'] = $naxxOdPlanMode;
        $naxxOdPlan['previous_mode'] = $naxxOdPreviousMode;
        naxxOdEnsureTable($naxxOdPdo);
        $naxxOdPdo->beginTransaction();
        $naxxOdRow = naxxOdRow($naxxOdPdo, $naxxOdId, true);
        $naxxOdSnapshot = naxxOdSnapshot($naxxOdPdo, $naxxOdRow);
        $naxxOdConflict = null;
        if ((string) ($naxxOdRow['uuid'] ?? '') !== $naxxOdPlan['uuid']) $naxxOdConflict = 'identity';
        elseif (!$naxxOdSnapshot['servers']) $naxxOdConflict = 'servers';
        elseif (!hash_equals($naxxOdPlan['hash'], $naxxOdSnapshot['hash'])) $naxxOdConflict = 'analysis';
        elseif ((int) $naxxOdRow['llod'] !== $naxxOdPlan['mode']) $naxxOdConflict = 'mode';
        if ($naxxOdConflict !== null) {
            $naxxOdPdo->rollBack();
            naxxOdReply(409, array('ok' => false, 'conflict' => $naxxOdConflict,
                'message' => 'O canal salvo difere da análise. Confira as fontes e analise novamente.'));
        }
        $naxxOdWrite = $naxxOdPdo->prepare('INSERT INTO naxx_ondemand_profiles (stream_id, stream_uuid, source_hash, effective_mode, previous_mode, reason, format_name, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE stream_uuid=VALUES(stream_uuid), source_hash=VALUES(source_hash), effective_mode=VALUES(effective_mode), previous_mode=VALUES(previous_mode), reason=VALUES(reason), format_name=VALUES(format_name), verified=VALUES(verified)');
        $naxxOdWrite->execute(array($naxxOdId, $naxxOdPlan['uuid'], $naxxOdPlan['hash'], $naxxOdPlan['mode'], $naxxOdPlan['previous_mode'],
            $naxxOdPlan['reason'], $naxxOdPlan['format'], (int) $naxxOdPlan['verified']));
        $naxxOdPdo->commit();
        unset($_SESSION['naxx_od_plans'][(string) $naxxOdId]);
        $naxxOdProfile = naxxOdPublicProfile(naxxOdLoadProfile($naxxOdPdo, $naxxOdId), $naxxOdRow, $naxxOdSnapshot);
        naxxOdReply(200, array('ok' => true, 'csrf' => $naxxOdCsrf, 'profile' => $naxxOdProfile));
    }
    if ($naxxOdAction === 'deactivate') {
        if ($naxxOdStored) {
            $naxxOdRemove = $naxxOdPdo->prepare('DELETE FROM naxx_ondemand_profiles WHERE stream_id = ? AND stream_uuid = ?');
            $naxxOdRemove->execute(array($naxxOdId, (string) ($naxxOdRow['uuid'] ?? '')));
        }
        unset($_SESSION['naxx_od_plans'][(string) $naxxOdId]);
        naxxOdReply(200, array('ok' => true, 'csrf' => $naxxOdCsrf));
    }
    naxxOdReply(400, array('ok' => false, 'message' => 'Ação automática inválida.'));
} catch (Throwable $naxxOdError) {
    if ($naxxOdPdo->inTransaction()) $naxxOdPdo->rollBack();
    naxxOdReply(503, array('ok' => false, 'message' => 'Não foi possível confirmar o perfil automático. O modo do canal permanece sob controle do painel.'));
}

}

if (($_GET['feature'] ?? '') === 'cache') {

// Diagnóstico somente de leitura. Executado pelo endpoint administrativo já instalado.
ini_set('display_errors','0');set_time_limit(12);
$naxxCacheDone=false;
function naxxCacheReply($code,$value){
 $GLOBALS['naxxCacheDone']=true;while(ob_get_level())ob_end_clean();
 if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
 header_remove('Location');header_remove('Content-Length');http_response_code($code);
 header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
 echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
register_shutdown_function(function(){if(empty($GLOBALS['naxxCacheDone']))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);});
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET'){header('Allow: GET');naxxCacheReply(405,['ok'=>false,'message'=>'O diagnóstico aceita somente consultas.']);}
$_GET=$_POST=$_REQUEST=[];
$naxxCacheHtml='';
ob_start(function($chunk)use(&$naxxCacheHtml){if(strlen($naxxCacheHtml)<2*1024*1024)$naxxCacheHtml.=$chunk;return '';},8192);
require __DIR__.'/cache.php';ob_end_flush();
$redirect=false;foreach(headers_list()as$line)if(stripos($line,'Location:')===0)$redirect=true;
if($redirect||http_response_code()>=300||!preg_match('/\bid\s*=\s*[\x22\x27](?:cache_thread_count|enable_cache|disable_cache|enable_handler|disable_handler)[\x22\x27]/',$naxxCacheHtml))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);
if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
$document=new DOMDocument();$previous=libxml_use_internal_errors(true);$document->loadHTML($naxxCacheHtml,LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);libxml_clear_errors();libxml_use_internal_errors($previous);
$cache=['enabled'=>(bool)$document->getElementById('disable_cache'),'handler_enabled'=>(bool)$document->getElementById('disable_handler'),'last_run'=>null,'counts'=>[]];
if(preg_match('/Your last cron execution was at\s*(?:<strong>)?([0-9-]+\s+[0-9:]+)/',$naxxCacheHtml,$date))$cache['last_run']=$date[1];
$table=$document->getElementById('datatable-cache');if($table)foreach($table->getElementsByTagName('button')as$button)$cache['counts'][]=trim($button->textContent);
$nativeRedis=$document->getElementById('datatable-redis');$cache['native_redis_warning']=$nativeRedis?(bool)preg_match('/OFFLINE|INVALID PASSWORD/i',$nativeRedis->textContent):false;
$redis=['status'=>'unavailable','message'=>'A extensão Redis não está disponível neste servidor.'];$client=null;
if(class_exists('Redis')){
 $connected=false;
 try{
  $config=@file_get_contents(dirname(__DIR__).'/bin/redis/redis.conf',false,null,0,1024*1024);
  if($config===false)throw new RuntimeException('configuration');
  $port=6379;if(preg_match('/^\s*port\s+(\d+)\s*$/m',$config,$match))$port=(int)$match[1];
  if($port<1||$port>65535)throw new RuntimeException('configuration');
  $password='';if(preg_match('/^\s*requirepass\s+(.+?)\s*$/m',$config,$match)){
   $value=trim($match[1]);
   if($value[0]==='"'&&substr($value,-1)==='"')$password=stripcslashes(substr($value,1,-1));
   elseif($value[0]==="'"&&substr($value,-1)==="'")$password=substr($value,1,-1);
   else{$parts=preg_split('/\s+/', $value);$password=$parts[0];}
  }
  $client=new Redis();$start=microtime(true);$connected=$client->connect('127.0.0.1',$port,0.8);
  if(!$connected)throw new RuntimeException('connection');$client->setOption(Redis::OPT_READ_TIMEOUT,1.0);
  if($password!==''&&!$client->auth($password))throw new RuntimeException('authentication');
  $client->ping();$latency=round((microtime(true)-$start)*1000,2);
  $memory=$client->info('memory');$stats=$client->info('stats');$clients=$client->info('clients');$server=$client->info('server');$keyspace=$client->info('keyspace');
  $keys=0;foreach($keyspace as$db=>$value){if(!preg_match('/^db\d+$/',$db))continue;if(is_array($value))$keys+=(int)($value['keys']??0);elseif(preg_match('/(?:^|,)keys=(\d+)/',$value,$match))$keys+=(int)$match[1];}
  $hits=(int)($stats['keyspace_hits']??0);$misses=(int)($stats['keyspace_misses']??0);
  $redis=['status'=>'online','message'=>'Redis respondeu ao diagnóstico local.','latency_ms'=>$latency,'used_memory'=>(int)($memory['used_memory']??0),'peak_memory'=>(int)($memory['used_memory_peak']??0),'max_memory'=>(int)($memory['maxmemory']??0),'clients'=>(int)($clients['connected_clients']??0),'keys'=>$keys,'hits'=>$hits,'misses'=>$misses,'hit_rate'=>$hits+$misses?round($hits/($hits+$misses)*100,1):null,'evictions'=>(int)($stats['evicted_keys']??0),'operations_per_second'=>(int)($stats['instantaneous_ops_per_sec']??0),'uptime_seconds'=>(int)($server['uptime_in_seconds']??0)];
 }catch(Throwable$error){$redis=['status'=>$connected?'authentication_error':'offline','message'=>$connected?'Não foi possível autenticar ou consultar o Redis com a configuração local.':'Não foi possível consultar o Redis local. Confira o serviço e sua configuração.'];}
 finally{if($client){try{$client->close();}catch(Throwable$error){}}}
}
naxxCacheReply(200,['ok'=>true,'checked_at'=>date('c'),'cache'=>$cache,'redis'=>$redis]);

}

if (($_GET['feature'] ?? '') === 'stream-sources') {

// Consulta somente hosts de canais ao vivo. Embutida no endpoint administrativo pelo build.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(25);
$naxxSourceResponded = false;
$naxxSourceCheckingAccess = true;

function naxxSourceReply($status, array $payload) {
    $GLOBALS['naxxSourceResponded'] = true;
    while (ob_get_level() && ob_end_clean()) {}
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function naxxSourceHost($value) {
    if (!is_string($value) || strlen($value) > 255 || preg_match('/[\x00-\x20\x7f]/', $value)) return null;
    if (strpos($value, ':') !== false) {
        $address = $value;
        if (substr($address, 0, 1) === '[' && substr($address, -1) === ']') $address = substr($address, 1, -1);
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) return null;
        return '[' . strtolower(inet_ntop(inet_pton($address))) . ']';
    }
    $host = strtolower($value);
    if (substr($host, -1) === '.') $host = substr($host, 0, -1);
    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) return $host;
    if (preg_match('/^[0-9.]+$/D', $host) || filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) return null;
    return $host;
}

function naxxSourceHosts($value) {
    if (!is_string($value) || substr(ltrim($value), 0, 1) !== '[') return [];
    $sources = json_decode($value, true);
    if (!is_array($sources)) return [];
    $hosts = [];
    foreach ($sources as $source) {
        if (!is_string($source) || preg_match('/[\x00-\x20\x7f]/', $source)) continue;
        $parts = parse_url($source);
        if (!is_array($parts) || empty($parts['scheme']) || !isset($parts['host'])) continue;
        $host = naxxSourceHost($parts['host']);
        if ($host !== null) $hosts[$host] = true;
    }
    return $hosts;
}

function naxxSourceNativeAdmin(array $variables) {
    $found = false;
    $superglobals = ['GLOBALS', '_GET', '_POST', '_REQUEST', '_SERVER', '_COOKIE', '_FILES', '_SESSION', '_ENV'];
    foreach ($variables as $name => $group) {
        if (in_array($name, $superglobals, true) || !is_array($group) ||
            !isset($group['is_admin'], $group['is_reseller'], $group['group_id'])) continue;
        if (!in_array($group['is_admin'], [1, '1'], true) || !in_array($group['is_reseller'], [0, '0'], true) ||
            !in_array($group['group_id'], [1, '1'], true)) return false;
        $found = true;
    }
    return $found;
}

register_shutdown_function(function () {
    if (!empty($GLOBALS['naxxSourceResponded'])) return;
    if (!empty($GLOBALS['naxxSourceCheckingAccess'])) {
        naxxSourceReply(403, ['ok' => false, 'message' => 'Entre com uma conta do grupo administrador principal para consultar as fontes.']);
    }
    naxxSourceReply(503, ['ok' => false, 'message' => 'Não foi possível consultar as fontes dos canais.']);
});

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    naxxSourceReply(405, ['ok' => false, 'message' => 'Método inválido.']);
}
if (strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    naxxSourceReply(403, ['ok' => false, 'message' => 'Abra a lista de canais no painel para consultar as fontes.']);
}
$naxxSourceHost = null;
if (array_key_exists('host', $_GET)) {
    $naxxSourceHost = naxxSourceHost($_GET['host']);
    if ($naxxSourceHost === null) naxxSourceReply(400, ['ok' => false, 'message' => 'Informe um domínio ou endereço IP válido, sem porta.']);
}

// O núcleo verifica a sessão e o acesso à própria lista. Não encaminhe a entrada do filtro ao núcleo.
$naxxSourceSavedGet = $_GET;
$naxxSourceSavedPost = $_POST;
$naxxSourceSavedRequest = $_REQUEST;
$_GET = $_POST = $_REQUEST = [];
$naxxSourcePageFound = false;
$naxxSourceTail = '';
$naxxSourceBufferLevel = ob_get_level();
ob_start(function ($chunk) use (&$naxxSourcePageFound, &$naxxSourceTail) {
    $sample = $naxxSourceTail . $chunk;
    if (preg_match('/<table\b[^>]*\s+id\s*=\s*[\x22\x27]datatable-streampage[\x22\x27]/i', $sample)) $naxxSourcePageFound = true;
    $naxxSourceTail = substr($sample, -2048);
    return '';
}, 8192);
$naxxSourceBefore = array_fill_keys(array_keys(get_defined_vars()), true);
require __DIR__ . '/streams.php';
$naxxSourceNative = array_diff_key(get_defined_vars(), $naxxSourceBefore);
while (ob_get_level() > $naxxSourceBufferLevel && ob_end_flush()) {}
$_GET = $naxxSourceSavedGet;
$_POST = $naxxSourceSavedPost;
$_REQUEST = $naxxSourceSavedRequest;
$naxxSourceRedirect = false;
foreach (headers_list() as $naxxSourceHeader) {
    if (stripos($naxxSourceHeader, 'Location:') === 0) $naxxSourceRedirect = true;
}
$naxxSourceNativeStatus = http_response_code();
if (!$naxxSourcePageFound || $naxxSourceRedirect || $naxxSourceNativeStatus >= 300 || !naxxSourceNativeAdmin($naxxSourceNative)) {
    naxxSourceReply(403, ['ok' => false, 'message' => 'Entre com uma conta do grupo administrador principal para consultar as fontes.']);
}
$naxxSourceCheckingAccess = false;
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();

$naxxSourcePdo = null;
foreach ($naxxSourceNative as $naxxSourceValue) {
    if (is_object($naxxSourceValue) && get_class($naxxSourceValue) === 'Database' && ($naxxSourceValue->dbh ?? null) instanceof PDO) {
        $naxxSourcePdo = $naxxSourceValue->dbh;
        break;
    }
}
if (!$naxxSourcePdo) naxxSourceReply(503, ['ok' => false, 'message' => 'Não foi possível acessar o banco do painel.']);

try {
    $naxxSourcePdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $naxxSourceQuery = $naxxSourcePdo->prepare('SELECT id, stream_source FROM streams WHERE type = 1 AND id > ? ORDER BY id LIMIT 500');
    $naxxSourceAfter = 0;
    $naxxSourceRead = 0;
    $naxxSourceHostSet = [];
    $naxxSourceIds = [];
    do {
        $naxxSourceQuery->execute([$naxxSourceAfter]);
        $naxxSourceBatch = $naxxSourceQuery->fetchAll(PDO::FETCH_ASSOC);
        $naxxSourceQuery->closeCursor();
        foreach ($naxxSourceBatch as $naxxSourceRow) {
            if (++$naxxSourceRead > 50000) {
                naxxSourceReply(413, ['ok' => false, 'message' => 'O filtro de fonte aceita catálogos com até 50.000 canais ao vivo.']);
            }
            $naxxSourceId = (int) $naxxSourceRow['id'];
            if ($naxxSourceId <= $naxxSourceAfter) throw new RuntimeException('invalid_stream_cursor');
            $naxxSourceAfter = $naxxSourceId;
            $naxxSourceRowHosts = naxxSourceHosts($naxxSourceRow['stream_source']);
            if ($naxxSourceHost === null) $naxxSourceHostSet += $naxxSourceRowHosts;
            elseif (isset($naxxSourceRowHosts[$naxxSourceHost])) $naxxSourceIds[] = $naxxSourceId;
        }
    } while (count($naxxSourceBatch) === 500);
    if ($naxxSourceHost !== null) naxxSourceReply(200, ['ok' => true, 'ids' => $naxxSourceIds]);
    $naxxSourceResult = array_keys($naxxSourceHostSet);
    sort($naxxSourceResult, SORT_STRING);
    naxxSourceReply(200, ['ok' => true, 'hosts' => $naxxSourceResult]);
} catch (Throwable $naxxSourceError) {
    naxxSourceReply(503, ['ok' => false, 'message' => 'Não foi possível consultar as fontes dos canais.']);
}

}

// Interface autenticada do serviço local de atualização Xui Naxx.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(15);
$naxxUpdateResponded = false;

function naxxUpdateReply($status, $payload) {
    $GLOBALS['naxxUpdateResponded'] = true;
    while (ob_get_level()) ob_end_clean();
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json !== false ? $json : '{"ok":false,"message":"Não foi possível preparar a resposta da atualização."}';
    exit;
}

function naxxUpdateOrigin($value) {
    $parts = parse_url((string) $value);
    if (!$parts || !isset($parts['scheme'], $parts['host'])) return '';
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, array('http', 'https'), true)) return '';
    return $scheme . '://' . strtolower($parts['host']) . ':' . ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
}

register_shutdown_function(function () {
    if (empty($GLOBALS['naxxUpdateResponded'])) {
        naxxUpdateReply(403, array('ok' => false, 'message' => 'Entre com uma conta autorizada para alterar as configurações do painel.'));
    }
});

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, array('GET', 'POST'), true)) {
    header('Allow: GET, POST');
    naxxUpdateReply(405, array('ok' => false, 'message' => 'Método de atualização não permitido.'));
}
$request = array();
if ($method === 'POST') {
    $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    $expected = naxxUpdateOrigin($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
    $origin = naxxUpdateOrigin($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
    if (!$expected || $origin !== $expected || strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        naxxUpdateReply(403, array('ok' => false, 'message' => 'Abra a aba Atualização do painel e tente novamente.'));
    }
    $input = file_get_contents('php://input', false, null, 0, 4097);
    $request = json_decode($input, true);
    if (!is_array($request) || strlen((string) $input) > 4096) {
        naxxUpdateReply(400, array('ok' => false, 'message' => 'A solicitação de atualização está inválida.'));
    }
}

// Carrega a mesma sessão e a mesma permissão da configuração nativa.
// A saída é descartada em blocos para evitar manter a página inteira na memória.
$savedGet = $_GET;
$savedPost = $_POST;
$savedRequest = $_REQUEST;
$_GET = $_POST = $_REQUEST = array();
$_SERVER['REQUEST_METHOD'] = 'GET';
$nativeAllowed = false;
$nativeTail = '';
ob_start(function ($chunk) use (&$nativeAllowed, &$nativeTail) {
    $sample = $nativeTail . $chunk;
    if (preg_match('/<input\b[^>]*\bid\s*=\s*[\x22\x27]server_name[\x22\x27][^>]*\bname\s*=\s*[\x22\x27]server_name[\x22\x27]/i', $sample)) $nativeAllowed = true;
    $nativeTail = substr($sample, -256);
    return '';
}, 8192);
require __DIR__ . '/settings.php';
ob_end_flush();
$_GET = $savedGet;
$_POST = $savedPost;
$_REQUEST = $savedRequest;
$_SERVER['REQUEST_METHOD'] = $method;
$redirect = false;
foreach (headers_list() as $header) if (stripos($header, 'Location:') === 0) $redirect = true;
if (!$nativeAllowed || $redirect || http_response_code() >= 300) {
    naxxUpdateReply(403, array('ok' => false, 'message' => 'Entre com uma conta autorizada para alterar as configurações do painel.'));
}
// O carregamento nativo libera a sessão ao terminar a página. Reabre somente
// a sessão já autenticada para guardar/verificar o token, fechando-a em seguida.
if (session_status() !== PHP_SESSION_ACTIVE && session_id() !== '') @session_start();
if (session_status() !== PHP_SESSION_ACTIVE) {
    naxxUpdateReply(503, array('ok' => false, 'message' => 'Não foi possível validar a sessão de atualização. Entre novamente no painel.'));
}
if (!isset($_SESSION['naxx_update_csrf']) || !is_string($_SESSION['naxx_update_csrf']) || strlen($_SESSION['naxx_update_csrf']) !== 64) {
    $_SESSION['naxx_update_csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['naxx_update_csrf'];
$action = $method === 'GET' ? 'status' : ($request['action'] ?? '');
if ($method === 'POST' && (!is_string($request['csrf'] ?? null) || !hash_equals($csrf, $request['csrf']))) {
    naxxUpdateReply(403, array('ok' => false, 'message' => 'A sessão de atualização expirou. Recarregue esta aba.'));
}
if (!in_array($action, array('status', 'check', 'install', 'automatic', 'rollback'), true) || ($method === 'POST' && $action === 'status')) {
    naxxUpdateReply(400, array('ok' => false, 'message' => 'Ação de atualização inválida.'));
}
$command = array('action' => $action);
if ($action === 'automatic') {
    if (!array_key_exists('enabled', $request) || !is_bool($request['enabled'])) {
        naxxUpdateReply(400, array('ok' => false, 'message' => 'Informe se as atualizações automáticas devem ser ativadas.'));
    }
    $command['enabled'] = $request['enabled'];
}
session_write_close();

// O PHP nunca chama shell/sudo e não recebe caminhos ou URLs do navegador.
$connection = @stream_socket_client('unix:///run/naxx-update/control.sock', $errorCode, $errorMessage, 2, STREAM_CLIENT_CONNECT);
if (!$connection) {
    naxxUpdateReply(503, array('ok' => false, 'csrf' => $csrf, 'message' => 'O serviço local de atualização ainda não está disponível.'));
}
stream_set_timeout($connection, 3);
$message = json_encode($command) . "\n";
if (fwrite($connection, $message) !== strlen($message)) {
    fclose($connection);
    naxxUpdateReply(503, array('ok' => false, 'csrf' => $csrf, 'message' => 'Não foi possível enviar a solicitação ao serviço local.'));
}
$raw = fgets($connection, 65537);
$metadata = stream_get_meta_data($connection);
fclose($connection);
$response = is_string($raw) && strlen($raw) <= 65536 ? json_decode($raw, true) : null;
if ($metadata['timed_out'] || !is_array($response) || !isset($response['ok'])) {
    naxxUpdateReply(503, array('ok' => false, 'csrf' => $csrf, 'message' => 'O serviço local não respondeu. Verifique o estado da atualização antes de tentar novamente.'));
}
$response['csrf'] = $csrf;
if (isset($response['state']) && is_array($response['state'])) {
    $response['state']['interfaceVersion'] = '1.14.2';
}
if (empty($response['ok'])) {
    $status = isset($response['status']) && in_array((int) $response['status'], array(400, 403, 409, 500, 502, 503), true) ? (int) $response['status'] : 500;
    unset($response['status']);
    naxxUpdateReply($status, $response);
}
naxxUpdateReply(in_array($action, array('check', 'install', 'rollback'), true) ? 202 : 200, $response);
