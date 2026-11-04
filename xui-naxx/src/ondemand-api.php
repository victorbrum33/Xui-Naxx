<?php
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
