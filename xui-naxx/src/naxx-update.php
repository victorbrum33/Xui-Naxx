<?php
/* NAXX_CACHE_ENDPOINT */
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
if (empty($response['ok'])) {
    $status = isset($response['status']) && in_array((int) $response['status'], array(400, 403, 409, 500, 502, 503), true) ? (int) $response['status'] : 500;
    unset($response['status']);
    naxxUpdateReply($status, $response);
}
naxxUpdateReply(in_array($action, array('check', 'install', 'rollback'), true) ? 202 : 200, $response);
