<?php
// A lista passa pelo servidor em blocos; o cadastro continua nos formulários nativos.
// Protocolo v1: uint32BE + bloco; 0 + uint32BE + JSON final confirma o download.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');

function naxxUrlError($message, $status = 400) {
    while (ob_get_level()) ob_end_clean();
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    header_remove('Location');
    header_remove('Content-Length');
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(array('error' => $message), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function naxxUrlOrigin($value) {
    $parts = parse_url($value);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) return '';
    $scheme = strtolower($parts['scheme']);
    $port = isset($parts['port']) ? $parts['port'] : ($scheme === 'https' ? 443 : 80);
    return $scheme . '://' . strtolower($parts['host']) . ':' . $port;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    naxxUrlError('Use o botão Carregar URL no importador.', 405);
}
$scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
$expectedOrigin = naxxUrlOrigin($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if (!$expectedOrigin || naxxUrlOrigin($requestOrigin) !== $expectedOrigin ||
    strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'xmlhttprequest' ||
    ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    naxxUrlError('Abra o importador neste painel para carregar uma URL.', 403);
}
$requestedURL = $_POST['url'] ?? null;
if (!is_string($requestedURL) && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0) {
    // Apenas a URL é recebida aqui; nunca o arquivo da lista.
    $input = file_get_contents('php://input', false, null, 0, 16385);
    $json = json_decode($input, true);
    $requestedURL = is_array($json) ? ($json['url'] ?? null) : null;
}
if (!is_string($requestedURL) || !trim($requestedURL) || strlen($requestedURL) > 16384) {
    naxxUrlError('Informe um link direto válido para a lista.');
}
$requestedURL = trim($requestedURL);

// O core é protegido: usar a própria página mantém a sessão e as permissões
// de importação originais. A saída HTML não é enviada para esta resposta.
$naxxUrlNativeGate = true;
$naxxUrlStreaming = false;
$naxxUrlFinished = false;
$naxxUrlBytes = 0;
register_shutdown_function(function () use (&$naxxUrlNativeGate, &$naxxUrlStreaming, &$naxxUrlFinished, &$naxxUrlBytes) {
    if ($naxxUrlNativeGate) naxxUrlError('Sua sessão expirou ou seu usuário não tem permissão para importar. Entre novamente no painel.', 401);
    if ($naxxUrlStreaming && !$naxxUrlFinished && !connection_aborted()) {
        $result = json_encode(array('ok' => false, 'error' => 'O download foi interrompido no servidor. A lista não foi carregada.'), JSON_UNESCAPED_UNICODE);
        echo pack('N', 0) . pack('N', strlen($result)) . $result;
        flush();
    }
});
$_GET = array('import' => '1');
$_POST = array();
$_REQUEST = $_GET;
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
require __DIR__ . '/stream.php';
$nativeHTML = ob_get_clean();
$naxxUrlNativeGate = false;
$_SERVER['REQUEST_METHOD'] = 'POST';
$nativeLocation = false;
foreach (headers_list() as $nativeHeader) if (stripos($nativeHeader, 'Location:') === 0) $nativeLocation = true;
if ($nativeLocation || http_response_code() >= 300 || !preg_match('/\bid\s*=\s*[\x22\x27]stream_form[\x22\x27]/i', $nativeHTML)) {
    unset($nativeHTML);
    naxxUrlError('Seu usuário não tem permissão para importar ou a sessão expirou.', 403);
}
unset($nativeHTML);
$sessionKey = session_id();
if (!$sessionKey) naxxUrlError('Sua sessão expirou. Entre novamente no painel.', 401);
session_write_close();
while (ob_get_level()) ob_end_clean();
header_remove('Location');
header_remove('Content-Length');
if (!function_exists('curl_init')) naxxUrlError('O servidor precisa da extensão cURL para carregar listas por URL.', 503);

// Um download de cada vez deixa os processos do painel disponíveis.
$lockDirectory = rtrim(sys_get_temp_dir(), '/') . '/naxx-url-import';
if (!is_dir($lockDirectory) && !@mkdir($lockDirectory, 0700) && !is_dir($lockDirectory)) {
    naxxUrlError('Não foi possível reservar o processo de download. Tente novamente.', 503);
}
if (is_link($lockDirectory)) naxxUrlError('Não foi possível reservar o processo de download.', 503);
$downloadLock = @fopen($lockDirectory . '/download.lock', 'c');
if (!$downloadLock || !flock($downloadLock, LOCK_EX | LOCK_NB)) {
    naxxUrlError('Já há uma lista sendo baixada no servidor. Aguarde a conclusão ou cancele o download atual.', 409);
}
@chmod($lockDirectory . '/download.lock', 0600);
set_time_limit(0);
ignore_user_abort(false);

function naxxUrlInRange($ip, $cidr) {
    list($network, $bits) = explode('/', $cidr);
    $address = @inet_pton($ip);
    $prefix = @inet_pton($network);
    if ($address === false || $prefix === false || strlen($address) !== strlen($prefix)) return false;
    $whole = (int) floor($bits / 8);
    $rest = (int) $bits % 8;
    return substr($address, 0, $whole) === substr($prefix, 0, $whole) &&
        (!$rest || ((ord($address[$whole]) ^ ord($prefix[$whole])) & (0xff << (8 - $rest))) === 0);
}

function naxxUrlPublicIP($ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        foreach (array('0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4') as $range) {
            if (naxxUrlInRange($ip, $range)) return false;
        }
        return true;
    }
    if (!naxxUrlInRange($ip, '2000::/3')) return false;
    foreach (array('2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20') as $range) if (naxxUrlInRange($ip, $range)) return false;
    return true;
}

function naxxUrlTarget($url) {
    if (preg_match('/[\x00-\x20\x7f\\\\]/', $url) || strlen($url) > 16384) throw new RuntimeException('O endereço da lista é inválido.');
    $parts = @parse_url($url);
    if (!$parts || empty($parts['host']) || empty($parts['scheme']) || !in_array(strtolower($parts['scheme']), array('http', 'https'), true)) {
        throw new RuntimeException('Use um link direto HTTP ou HTTPS para a lista.');
    }
    if (isset($parts['user']) || isset($parts['pass'])) throw new RuntimeException('Use um link direto com os dados de acesso nos parâmetros da URL, sem usuário e senha antes do domínio.');
    $scheme = strtolower($parts['scheme']);
    $host = strtolower(rtrim($parts['host'], '.'));
    $literal = trim($host, '[]');
    $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
    if ($port < 1 || $port > 65535) throw new RuntimeException('A porta da URL é inválida.');
    if (filter_var($literal, FILTER_VALIDATE_IP)) {
        $addresses = array($literal);
    } else {
        if (preg_match('/[^\x00-\x7f]/', $host) && function_exists('idn_to_ascii')) $host = idn_to_ascii($host, 0, defined('INTL_IDNA_VARIANT_UTS46') ? INTL_IDNA_VARIANT_UTS46 : 0);
        if (!$host || !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) || strpos($host, '.') === false ||
            preg_match('/\.(?:localhost|local|internal|lan|home|invalid|test|onion)$/i', $host)) {
            throw new RuntimeException('A URL precisa apontar para um servidor público na internet.');
        }
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        $addresses = array();
        foreach (is_array($records) ? $records : array() as $record) {
            if (!empty($record['ip'])) $addresses[] = $record['ip'];
            if (!empty($record['ipv6'])) $addresses[] = $record['ipv6'];
        }
        if (!$addresses) throw new RuntimeException('Não foi possível localizar o servidor da lista. Confira o endereço e tente novamente.');
    }
    foreach ($addresses as $address) if (!naxxUrlPublicIP($address)) throw new RuntimeException('A URL precisa apontar para um servidor público; endereços locais ou reservados não são permitidos.');
    // Preferir IPv4 quando disponível; a conexão usa exatamente o IP validado.
    usort($addresses, function ($a, $b) { return (strpos($a, ':') !== false) <=> (strpos($b, ':') !== false); });
    $ip = $addresses[0];
    $urlHost = strpos($host, ':') !== false && $host[0] !== '[' ? '[' . $host . ']' : $host;
    $normal = $scheme . '://' . $urlHost . (isset($parts['port']) ? ':' . $port : '') . ($parts['path'] ?? '/');
    if (isset($parts['query'])) $normal .= '?' . $parts['query'];
    return array('url' => $normal, 'host' => $host, 'port' => $port, 'ip' => $ip);
}

function naxxUrlRedirect($base, $location) {
    $location = trim($location);
    if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $location)) return $location;
    $parts = parse_url($base);
    if (strpos($location, '//') === 0) return $parts['scheme'] . ':' . $location;
    $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    $location = explode('#', $location, 2)[0];
    if ($location === '') return $base;
    if ($location[0] === '?') return $origin . ($parts['path'] ?? '/') . $location;
    $path = $location[0] === '/' ? $location : preg_replace('~/[^/]*$~', '/', $parts['path'] ?? '/') . $location;
    list($pathname, $query) = array_pad(explode('?', $path, 2), 2, null);
    $segments = array();
    foreach (explode('/', $pathname) as $segment) {
        if ($segment === '..') { array_pop($segments); continue; }
        if ($segment !== '.') $segments[] = $segment;
    }
    return $origin . implode('/', $segments) . ($query !== null ? '?' . $query : '');
}

function naxxUrlFilename($headers, $url) {
    $filename = '';
    $disposition = $headers['content-disposition'] ?? '';
    if (preg_match("/filename\\*\\s*=\\s*UTF-8''([^;]+)/i", $disposition, $match)) $filename = rawurldecode(trim($match[1], '" '));
    elseif (preg_match('/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i', $disposition, $match)) $filename = trim($match[1] ?: ($match[2] ?? ''));
    if (!$filename) $filename = rawurldecode(basename(parse_url($url, PHP_URL_PATH) ?: ''));
    $filename = preg_replace('/[^\pL\pN ._()-]/u', '_', $filename);
    if (!$filename || !preg_match('/\.(?:m3u8?|csv|json)$/i', $filename)) {
        $mime = $headers['content-type'] ?? '';
        $filename = 'lista-url.' . (stripos($mime, 'json') !== false ? 'json' : (stripos($mime, 'csv') !== false ? 'csv' : 'm3u'));
    }
    if (strlen($filename) > 180) $filename = 'lista-url.' . pathinfo($filename, PATHINFO_EXTENSION);
    return trim($filename, '. ');
}

function naxxUrlFinish($ok, $message = '') {
    global $naxxUrlFinished, $naxxUrlBytes;
    $result = $ok ? array('ok' => true, 'bytes' => $naxxUrlBytes) : array('ok' => false, 'error' => $message);
    $json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo pack('N', 0) . pack('N', strlen($json)) . $json;
    $naxxUrlFinished = true;
    flush();
}

try {
    $url = $requestedURL;
    for ($redirect = 0; $redirect <= 5; $redirect++) {
        $target = naxxUrlTarget($url);
        $status = 0;
        $headers = array();
        $unexpectedIP = false;
        $curl = curl_init($target['url']);
        $resolveIP = strpos($target['ip'], ':') === false ? $target['ip'] : '[' . $target['ip'] . ']';
        $resolveHost = trim($target['host'], '[]');
        $options = array(
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_LOW_SPEED_LIMIT => 1,
            CURLOPT_LOW_SPEED_TIME => 45,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROXY => '',
            CURLOPT_NOPROXY => '*',
            CURLOPT_ENCODING => 'identity',
            CURLOPT_USERAGENT => 'XUI-NAXX/1.5.14 catalog-import',
            CURLOPT_HTTPHEADER => array('Accept: audio/x-mpegurl, application/vnd.apple.mpegurl, text/csv, application/json, text/plain, */*;q=0.5'),
            CURLOPT_BUFFERSIZE => 65536,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_XFERINFOFUNCTION => function () { return connection_aborted() ? 1 : 0; },
            CURLOPT_HEADERFUNCTION => function ($handle, $line) use (&$status, &$headers, &$unexpectedIP, $target) {
                if (preg_match('~^HTTP/\S+\s+(\d{3})~i', $line, $match)) { $status = (int) $match[1]; $headers = array(); }
                elseif (strpos($line, ':') !== false) {
                    list($name, $value) = explode(':', $line, 2);
                    $name = strtolower(trim($name));
                    if (in_array($name, array('location', 'content-type', 'content-disposition', 'content-length', 'content-encoding'), true)) $headers[$name] = trim($value);
                }
                if (trim($line) === '' && $status >= 200) {
                    $connectedIP = curl_getinfo($handle, CURLINFO_PRIMARY_IP);
                    if (@inet_pton($connectedIP) !== @inet_pton($target['ip'])) { $unexpectedIP = true; return 0; }
                    if ($status < 200 || $status >= 300) return 0;
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($handle, $data) use (&$status, &$headers, $target) {
                global $naxxUrlStreaming, $naxxUrlBytes;
                if (connection_aborted() || $status < 200 || $status >= 300) return 0;
                if (!$naxxUrlStreaming) {
                    http_response_code(200);
                    header('Content-Type: application/octet-stream');
                    header('Cache-Control: no-store');
                    header('X-Content-Type-Options: nosniff');
                    header('X-Accel-Buffering: no');
                    header('X-Naxx-Stream-Protocol: 1');
                    $filename = naxxUrlFilename($headers, $target['url']);
                    header('Content-Disposition: attachment; filename="lista-url.' . pathinfo($filename, PATHINFO_EXTENSION) . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
                    header('X-Naxx-Import-Filename: ' . rawurlencode($filename));
                    $mime = explode(';', $headers['content-type'] ?? 'application/octet-stream', 2)[0];
                    if (!preg_match('~^[a-z0-9.+_-]+/[a-z0-9.+_-]+$~i', $mime)) $mime = 'application/octet-stream';
                    header('X-Naxx-Content-Type: ' . $mime);
                    if (empty($headers['content-encoding']) || strtolower($headers['content-encoding']) === 'identity') {
                        $length = $headers['content-length'] ?? '';
                        if (ctype_digit($length)) header('X-Naxx-Content-Length: ' . $length);
                    }
                    $naxxUrlStreaming = true;
                }
                $length = strlen($data);
                echo pack('N', $length) . $data;
                $naxxUrlBytes += $length;
                flush();
                return connection_aborted() ? 0 : $length;
            }
        );
        if (!filter_var(trim($target['host'], '[]'), FILTER_VALIDATE_IP)) $options[CURLOPT_RESOLVE] = array($resolveHost . ':' . $target['port'] . ':' . $resolveIP);
        $options[CURLOPT_IPRESOLVE] = strpos($target['ip'], ':') === false ? CURL_IPRESOLVE_V4 : CURL_IPRESOLVE_V6;
        curl_setopt_array($curl, $options);
        $result = curl_exec($curl);
        $curlError = curl_errno($curl);
        curl_close($curl);
        if (connection_aborted()) exit;
        if ($unexpectedIP) throw new RuntimeException('O destino da conexão não corresponde ao servidor validado.');
        if (in_array($status, array(301, 302, 303, 307, 308), true)) {
            if (empty($headers['location'])) throw new RuntimeException('O servidor enviou um redirecionamento sem endereço de destino.');
            if ($redirect === 5) throw new RuntimeException('A URL redirecionou muitas vezes. Use o link direto da lista.');
            $url = naxxUrlRedirect($target['url'], $headers['location']);
            continue;
        }
        if ($status < 200 || $status >= 300) {
            if ($status === 401 || $status === 403) throw new RuntimeException('O provedor recusou o acesso à lista. Confira os dados de acesso do link.');
            if ($status === 404) throw new RuntimeException('A lista não foi encontrada no endereço informado.');
            if ($status) throw new RuntimeException('O servidor da lista respondeu com erro HTTP ' . $status . '.');
        }
        if ($result === false) {
            if ($curlError === CURLE_OPERATION_TIMEDOUT) throw new RuntimeException('O servidor da lista demorou para responder ou ficou sem enviar dados. Tente novamente.');
            if (in_array($curlError, array(CURLE_PEER_FAILED_VERIFICATION, CURLE_SSL_CONNECT_ERROR), true)) throw new RuntimeException('Não foi possível validar a conexão HTTPS do servidor da lista.');
            throw new RuntimeException('A conexão com o servidor da lista falhou ou foi interrompida. Tente novamente.');
        }
        if (!$naxxUrlStreaming || !$naxxUrlBytes) throw new RuntimeException('O servidor retornou uma lista vazia.');
        naxxUrlFinish(true);
        exit;
    }
} catch (Throwable $error) {
    if ($naxxUrlStreaming) {
        naxxUrlFinish(false, $error instanceof RuntimeException ? $error->getMessage() : 'Não foi possível concluir o download da lista. Tente novamente.');
        exit;
    }
    naxxUrlError($error instanceof RuntimeException ? $error->getMessage() : 'Não foi possível carregar a lista. Tente novamente.', 422);
}
