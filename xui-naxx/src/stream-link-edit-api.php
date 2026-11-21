<?php
// Embedded after stream-link-edit-core.php by the build; never loads native mutation input.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
set_time_limit(60);
$naxxLinkResponded = false;
$naxxLinkCheckingAccess = true;
$naxxLinkCsrf = null;

function naxxLinkReply($status, array $payload) {
    $GLOBALS['naxxLinkResponded'] = true;
    if (is_string($GLOBALS['naxxLinkCsrf'] ?? null)) $payload['csrf'] = $GLOBALS['naxxLinkCsrf'];
    while (ob_get_level() && ob_end_clean()) {}
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json !== false ? $json : '{"ok":false,"message":"Não foi possível preparar a resposta."}';
    exit;
}

function naxxLinkOrigin($value) {
    $parts = parse_url((string) $value);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) return '';
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) return '';
    return $scheme . '://' . strtolower($parts['host']) . ':' . ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
}

function naxxLinkNativeAdmin(array $variables) {
    $found = false;
    $excluded = ['GLOBALS', '_GET', '_POST', '_REQUEST', '_SERVER', '_COOKIE', '_FILES', '_SESSION', '_ENV'];
    foreach ($variables as $name => $group) {
        if (in_array($name, $excluded, true) || !is_array($group) || !isset($group['is_admin'], $group['is_reseller'], $group['group_id'])) continue;
        if (!in_array($group['is_admin'], [1, '1'], true) || !in_array($group['is_reseller'], [0, '0'], true) || !in_array($group['group_id'], [1, '1'], true)) return false;
        $found = true;
    }
    return $found;
}

register_shutdown_function(function () {
    if (!empty($GLOBALS['naxxLinkResponded'])) return;
    $access = !empty($GLOBALS['naxxLinkCheckingAccess']);
    naxxLinkReply($access ? 403 : 503, ['ok' => false, 'message' => $access ? 'Entre com uma conta do grupo administrador principal para editar links e logos.' : 'Não foi possível concluir a edição. Retome a mesma prévia antes de tentar novamente.']);
});

$naxxLinkMethod = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($naxxLinkMethod, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    naxxLinkReply(405, ['ok' => false, 'message' => 'Método não permitido.']);
}
$naxxLinkScheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
$naxxLinkExpectedOrigin = naxxLinkOrigin($naxxLinkScheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
$naxxLinkRequestOrigin = naxxLinkOrigin($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
if (!$naxxLinkExpectedOrigin || $naxxLinkRequestOrigin !== $naxxLinkExpectedOrigin || strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') naxxLinkReply(403, ['ok' => false, 'message' => 'Abra a edição em massa na lista de canais do painel.']);
$naxxLinkRequest = [];
if ($naxxLinkMethod === 'POST') {
    if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 8388608) naxxLinkReply(413, ['ok' => false, 'message' => 'A solicitação ultrapassa 8 MiB. Reduza a seleção ou a lista M3U.']);
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) naxxLinkReply(415, ['ok' => false, 'message' => 'Envie uma solicitação JSON válida.']);
    $naxxLinkInput = file_get_contents('php://input', false, null, 0, 8388609);
    if ($naxxLinkInput === false || strlen($naxxLinkInput) > 8388608) naxxLinkReply(413, ['ok' => false, 'message' => 'A solicitação ultrapassa 8 MiB. Reduza a seleção ou a lista M3U.']);
    $naxxLinkRequest = json_decode($naxxLinkInput, true, 32);
    if (!is_array($naxxLinkRequest) || json_last_error() !== JSON_ERROR_NONE) naxxLinkReply(400, ['ok' => false, 'message' => 'A solicitação está inválida.']);
    unset($naxxLinkInput);
}

// Native stream_mass.php validates its own session/page permission. Nothing from the
// incoming request is forwarded to the native page, including action and stream IDs.
$naxxLinkSavedGet = $_GET;
$naxxLinkSavedPost = $_POST;
$naxxLinkSavedRequest = $_REQUEST;
$_GET = $_POST = $_REQUEST = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$naxxLinkPageFound = false;
$naxxLinkTail = '';
$naxxLinkBufferLevel = ob_get_level();
ob_start(function ($chunk) use (&$naxxLinkPageFound, &$naxxLinkTail) {
    $sample = $naxxLinkTail . $chunk;
    if (preg_match('/<table\b[^>]*\s+id\s*=\s*[\x22\x27]datatable-mass[\x22\x27]/i', $sample)) $naxxLinkPageFound = true;
    $naxxLinkTail = substr($sample, -2048);
    return '';
}, 8192);
$naxxLinkBefore = array_fill_keys(array_keys(get_defined_vars()), true);
require __DIR__ . '/stream_mass.php';
$naxxLinkNative = array_diff_key(get_defined_vars(), $naxxLinkBefore);
while (ob_get_level() > $naxxLinkBufferLevel && ob_end_flush()) {}
$_GET = $naxxLinkSavedGet;
$_POST = $naxxLinkSavedPost;
$_REQUEST = $naxxLinkSavedRequest;
$_SERVER['REQUEST_METHOD'] = $naxxLinkMethod;
$naxxLinkRedirect = false;
foreach (headers_list() as $naxxLinkHeader) if (stripos($naxxLinkHeader, 'Location:') === 0) $naxxLinkRedirect = true;
if (!$naxxLinkPageFound || $naxxLinkRedirect || http_response_code() >= 300 || !naxxLinkNativeAdmin($naxxLinkNative) || session_id() === '') naxxLinkReply(403, ['ok' => false, 'message' => 'Entre com uma conta do grupo administrador principal para editar links e logos.']);
// Native pages close their session in the footer. Reopen only the existing authenticated
// session after the native page and principal-group checks have succeeded.
if (session_status() !== PHP_SESSION_ACTIVE) @session_start();
if (session_status() !== PHP_SESSION_ACTIVE || session_id() === '') naxxLinkReply(403, ['ok' => false, 'message' => 'Entre com uma conta do grupo administrador principal para editar links e logos.']);
$naxxLinkCheckingAccess = false;
if (!isset($_SESSION['naxx_link_edit_csrf']) || !is_string($_SESSION['naxx_link_edit_csrf']) || !preg_match('/^[a-f0-9]{64}$/D', $_SESSION['naxx_link_edit_csrf'])) $_SESSION['naxx_link_edit_csrf'] = bin2hex(random_bytes(32));
$naxxLinkCsrf = $_SESSION['naxx_link_edit_csrf'];
$naxxLinkConfig = ['dir' => '/home/xui/tmp/naxx-link-edits', 'scope' => hash('sha256', session_id()), 'secret' => $naxxLinkCsrf];
if ($naxxLinkMethod === 'POST' && (!is_string($naxxLinkRequest['csrf'] ?? null) || !hash_equals($naxxLinkCsrf, $naxxLinkRequest['csrf']))) naxxLinkReply(403, ['ok' => false, 'message' => 'A sessão da edição expirou. Reabra a edição em massa.']);
session_write_close();
if ($naxxLinkMethod === 'GET') naxxLinkReply(200, ['ok' => true, 'limits' => naxxLinkLimits()]);

$naxxLinkPdo = null;
foreach ($naxxLinkNative as $naxxLinkValue) {
    if (is_object($naxxLinkValue) && get_class($naxxLinkValue) === 'Database' && ($naxxLinkValue->dbh ?? null) instanceof PDO) { $naxxLinkPdo = $naxxLinkValue->dbh; break; }
}
if (!$naxxLinkPdo) naxxLinkReply(503, ['ok' => false, 'message' => 'Não foi possível acessar o banco do painel.']);
try {
    $naxxLinkPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $naxxLinkAction = $naxxLinkRequest['action'] ?? '';
    if ($naxxLinkAction === 'catalog') {
        $naxxLinkIds = naxxLinkIds($naxxLinkRequest['ids'] ?? null);
        naxxLinkReply(200, ['ok' => true, 'channels' => naxxLinkCatalog($naxxLinkPdo, $naxxLinkIds)]);
    }
    if ($naxxLinkAction === 'preview') {
        $naxxLinkIds = naxxLinkIds($naxxLinkRequest['ids'] ?? null);
        $naxxLinkOperation = naxxLinkOperation($naxxLinkRequest['operation'] ?? []);
        naxxLinkReply(200, naxxLinkPreview($naxxLinkPdo, $naxxLinkIds, $naxxLinkOperation, $naxxLinkConfig));
    }
    if ($naxxLinkAction === 'apply') naxxLinkReply(200, naxxLinkApply($naxxLinkPdo, $naxxLinkRequest['token'] ?? null, $naxxLinkRequest['cursor'] ?? null, $naxxLinkConfig));
    if ($naxxLinkAction === 'discard') naxxLinkReply(200, naxxLinkDiscard($naxxLinkRequest['token'] ?? null, $naxxLinkConfig));
    naxxLinkReply(422, ['ok' => false, 'message' => 'Escolha uma operação válida.']);
} catch (Throwable $naxxLinkError) {
    if ($naxxLinkPdo->inTransaction()) $naxxLinkPdo->rollBack();
    $naxxLinkStatus = $naxxLinkError instanceof RuntimeException ? $naxxLinkError->getCode() : 0;
    $naxxLinkSafe = in_array($naxxLinkStatus, [403, 409, 410, 413, 422, 503], true) ? json_decode($naxxLinkError->getMessage(), true) : null;
    if (!is_array($naxxLinkSafe) || !is_string($naxxLinkSafe['message'] ?? null)) { $naxxLinkStatus = 503; $naxxLinkSafe = ['message' => 'Não foi possível concluir a edição. Retome a mesma prévia antes de tentar novamente.']; }
    naxxLinkReply($naxxLinkStatus, ['ok' => false] + $naxxLinkSafe);
}
