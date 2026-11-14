<?php
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
