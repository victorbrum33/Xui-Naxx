<?php
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
