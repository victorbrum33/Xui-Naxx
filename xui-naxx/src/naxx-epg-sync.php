<?php
// Associa canais ao XMLTV por nome normalizado, preservando vínculos existentes.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(60);

$naxxEpgResponded = false;
$naxxEpgPhase = 'request';
$naxxEpgPdo = null;

function naxxEpgRespond($status, $payload) {
    $GLOBALS['naxxEpgResponded'] = true;
    while (ob_get_level()) ob_end_clean();
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json !== false ? $json : '{"ok":false,"message":"Não foi possível preparar a resposta da sincronização."}';
    exit;
}

function naxxEpgOrigin($value) {
    $parts = parse_url($value);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) return '';
    $scheme = strtolower($parts['scheme']);
    $port = isset($parts['port']) ? $parts['port'] : ($scheme === 'https' ? 443 : 80);
    return $scheme . '://' . strtolower($parts['host']) . ':' . $port;
}

function naxxEpgRollback($pdo) {
    try {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    } catch (Throwable $error) {
        // Uma conexão encerrada não deve impedir a resposta JSON de erro.
    }
}

function naxxEpgNormalize($value, $ignoreQuality = true) {
    $name = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    // Símbolos fazem parte do nome de canais como ESPN+, A&E e E!.
    if (!preg_match('//u', $name)) return '';
    $name = strtr($name, array('+' => ' plus ', '&' => ' and ', '!' => ' exclamation '));
    if (function_exists('iconv')) {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        if ($ascii !== false) $name = $ascii;
    }
    $name = strtolower($name);
    if ($ignoreQuality) {
        // Remove apenas sufixos de qualidade; preserva marcas como "4K Universe".
        $name = preg_replace('/(?:[\s()[\]{}._|\/-]+(?:sd|hd|fhd|uhd|4k|8k|hdr10?|hevc|h\.?265|h\.?264|720p|1080[pi]|2160p|\d{2,3}\s*fps))+[\s()[\]{}._|\/-]*$/i', '', $name);
    }
    return preg_replace('/[^a-z0-9]+/', '', $name);
}

function naxxEpgCatalogAdd(&$catalog, $key, $candidate) {
    if ($key === '') return;
    if (!array_key_exists($key, $catalog)) {
        $catalog[$key] = $candidate;
    } elseif ($catalog[$key] !== null &&
        ($catalog[$key]['epg_id'] !== $candidate['epg_id'] || $catalog[$key]['channel_id'] !== $candidate['channel_id'])) {
        // null representa ambiguidade sem manter uma lista ilimitada de candidatos.
        $catalog[$key] = null;
    }
}

function naxxEpgMatch($name, $exact, $relaxed) {
    $key = naxxEpgNormalize($name, false);
    if ($key !== '' && array_key_exists($key, $exact)) return $exact[$key];
    $key = naxxEpgNormalize($name);
    return $key !== '' && array_key_exists($key, $relaxed) ? $relaxed[$key] : false;
}

function naxxEpgLanguage($raw) {
    if (!is_string($raw) || trim($raw) === '') return '';
    $values = json_decode($raw, true);
    if (!is_array($values)) {
        $values = @unserialize($raw, array('allowed_classes' => false));
    }
    if (is_array($values)) {
        foreach ($values as $key => $value) {
            foreach (array($value, $key) as $candidate) {
                if (is_string($candidate) && preg_match('/^[a-z]{2,3}(?:[_-][a-z0-9]{2,8})?$/i', trim($candidate))) return trim($candidate);
            }
        }
    }
    return preg_match('/^[a-z]{2,3}(?:[_-][a-z0-9]{2,8})?$/i', trim($raw)) ? trim($raw) : '';
}

// O código nativo pode encerrar a execução durante a validação da sessão.
// Mesmo nesse caso o fetch recebe JSON, sem HTML de login ou corpo vazio.
register_shutdown_function(function () {
    if (!empty($GLOBALS['naxxEpgResponded'])) return;
    $pdo = $GLOBALS['naxxEpgPdo'] ?? null;
    naxxEpgRollback($pdo);
    $auth = ($GLOBALS['naxxEpgPhase'] ?? '') === 'auth';
    naxxEpgRespond($auth ? 403 : 500, array('ok' => false, 'message' => $auth
        ? 'Entre com uma conta autorizada para gerenciar canais.'
        : 'A sincronização foi interrompida. Tente novamente.'));
});

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    naxxEpgRespond(405, array('ok' => false, 'message' => 'Use o botão Sincronizar canais nesta página.'));
}
$scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
$expectedOrigin = naxxEpgOrigin($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!$expectedOrigin || naxxEpgOrigin($requestOrigin) !== $expectedOrigin ||
    strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' ||
    ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    naxxEpgRespond(403, array('ok' => false, 'message' => 'Abra o painel e tente novamente.'));
}
$input = file_get_contents('php://input', false, null, 0, 2049);
$request = json_decode($input, true);
if (!is_array($request) || strlen((string) $input) > 2048) {
    naxxEpgRespond(400, array('ok' => false, 'message' => 'A solicitação de sincronização está inválida.'));
}
$dryRun = isset($request['dry_run']) && $request['dry_run'] === true;
if (isset($request['dry_run']) && !is_bool($request['dry_run'])) {
    naxxEpgRespond(400, array('ok' => false, 'message' => 'A solicitação de sincronização está inválida.'));
}

// Reutiliza a sessão e a permissão de edição em lote do próprio XUI.
$naxxEpgPhase = 'auth';
$savedGet = $_GET;
$savedPost = $_POST;
$savedRequest = $_REQUEST;
$_GET = array();
$_POST = array();
$_REQUEST = $_GET;
$_SERVER['REQUEST_METHOD'] = 'GET';
$nativeFormFound = false;
$nativeTail = '';
ob_start(function ($chunk) use (&$nativeFormFound, &$nativeTail) {
    $sample = $nativeTail . $chunk;
    if (preg_match('/<input\b[^>]*\bname\s*=\s*[\x22\x27]streams[\x22\x27][^>]*\bid\s*=\s*[\x22\x27]streams[\x22\x27]/i', $sample)) $nativeFormFound = true;
    $nativeTail = substr($sample, -128);
    return '';
}, 8192);
require __DIR__ . '/stream_mass.php';
ob_end_flush();
$_GET = $savedGet;
$_POST = $savedPost;
$_REQUEST = $savedRequest;
$_SERVER['REQUEST_METHOD'] = 'POST';
$nativeRedirect = false;
foreach (headers_list() as $header) if (stripos($header, 'Location:') === 0) $nativeRedirect = true;
if ($nativeRedirect || http_response_code() >= 300 || !$nativeFormFound) {
    naxxEpgRespond(403, array('ok' => false, 'message' => 'Entre com uma conta autorizada para gerenciar canais.'));
}
unset($nativeTail);
$naxxEpgPhase = 'sync';
// Libera outras requisições do painel enquanto os canais são processados.
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();

$database = null;
foreach (get_defined_vars() as $value) {
    if (is_object($value) && get_class($value) === 'Database') { $database = $value; break; }
}
if (!$database || !isset($database->dbh) || !($database->dbh instanceof PDO)) {
    naxxEpgRespond(503, array('ok' => false, 'message' => 'Não foi possível acessar o banco do painel.'));
}

$lock = @fopen(rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'naxx-epg-sync-' . substr(hash('sha256', __DIR__), 0, 16) . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    naxxEpgRespond(409, array('ok' => false, 'message' => 'Já existe uma sincronização em andamento. Aguarde a conclusão.'));
}

try {
    $pdo = $database->dbh;
    $naxxEpgPdo = $pdo;
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stats = array('epg_channels' => 0, 'live_channels' => 0, 'linked' => 0, 'preserved' => 0, 'unmatched' => 0, 'ambiguous' => 0);
    $exact = $relaxed = array();
    $lastEpgId = 0;
    $maxEpgId = (int) $pdo->query('SELECT MAX(id) FROM epg_channels')->fetchColumn();
    $epgStatement = $pdo->prepare("SELECT c.id, c.epg_id, c.channel_id, c.name, c.langs FROM epg_channels c INNER JOIN epg e ON e.id = c.epg_id WHERE c.id > :after_id AND c.id <= :max_id AND c.channel_id IS NOT NULL AND c.channel_id <> '' ORDER BY c.id LIMIT 500");
    do {
        $epgStatement->execute(array('after_id' => $lastEpgId, 'max_id' => $maxEpgId));
        $batch = $epgStatement->fetchAll(PDO::FETCH_ASSOC);
        $epgStatement->closeCursor();
        foreach ($batch as $row) {
            $lastEpgId = (int) $row['id'];
            $stats['epg_channels']++;
            $channel = trim((string) $row['channel_id']);
            $epgId = (int) $row['epg_id'];
            if ($channel === '' || $epgId < 1) continue;
            $candidate = array('epg_id' => $epgId, 'channel_id' => $channel, 'epg_lang' => naxxEpgLanguage($row['langs'] ?? ''));
            naxxEpgCatalogAdd($exact, naxxEpgNormalize($row['name'] ?? '', false), $candidate);
            naxxEpgCatalogAdd($relaxed, naxxEpgNormalize($row['name'] ?? ''), $candidate);
        }
    } while (count($batch) === 500);
    unset($batch, $candidate);

    $lastStreamId = 0;
    $maxStreamId = (int) $pdo->query('SELECT MAX(id) FROM streams WHERE type = 1')->fetchColumn();
    $streamStatement = $pdo->prepare('SELECT id, stream_display_name, epg_id, channel_id, epg_api FROM streams WHERE type = 1 AND id > :after_id AND id <= :max_id ORDER BY id LIMIT 500');
    $updateStatement = $pdo->prepare("UPDATE streams SET epg_id = :epg_id, channel_id = :channel_id, epg_lang = :epg_lang, epg_api = 0 WHERE id = :id AND type = 1 AND stream_display_name = :source_name AND (epg_id IS NULL OR epg_id = 0) AND (channel_id IS NULL OR TRIM(channel_id) = '') AND (epg_api IS NULL OR epg_api = 0)");
    if (!$dryRun) $pdo->beginTransaction();
    do {
        $streamStatement->execute(array('after_id' => $lastStreamId, 'max_id' => $maxStreamId));
        $batch = $streamStatement->fetchAll(PDO::FETCH_ASSOC);
        $streamStatement->closeCursor();
        foreach ($batch as $stream) {
            $lastStreamId = (int) $stream['id'];
            $stats['live_channels']++;
            if ((int) ($stream['epg_id'] ?? 0) !== 0 || trim((string) ($stream['channel_id'] ?? '')) !== '' || (int) ($stream['epg_api'] ?? 0) !== 0) {
                $stats['preserved']++;
                continue;
            }
            $match = naxxEpgMatch($stream['stream_display_name'] ?? '', $exact, $relaxed);
            if ($match === null) {
                $stats['ambiguous']++;
            } elseif ($match === false) {
                $stats['unmatched']++;
            } elseif ($dryRun) {
                $stats['linked']++;
            } else {
                $match['id'] = $lastStreamId;
                $match['source_name'] = $stream['stream_display_name'];
                $updateStatement->execute($match);
                if ($updateStatement->rowCount() === 1) $stats['linked']++;
                else $stats['preserved']++;
            }
        }
    } while (count($batch) === 500);
    if (!$dryRun) $pdo->commit();
    naxxEpgRespond(200, array('ok' => true, 'dry_run' => $dryRun, 'stats' => $stats));
} catch (Throwable $error) {
    naxxEpgRollback($pdo ?? null);
    naxxEpgRespond(500, array('ok' => false, 'message' => 'A sincronização não foi concluída. Os vínculos manuais foram preservados.'));
}
