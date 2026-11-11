<?php
// Executa o endpoint real via PHP local, com bootstrap e banco simulados.
$fixture = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'naxx-source-api-' . bin2hex(random_bytes(8));
if (!mkdir($fixture, 0700)) throw new RuntimeException('Não foi possível criar a fixture.');
$process = null;
$checks = 0;

function sourceCheck($condition, $message) {
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}

function sourceRequest($query = '', $extra = [], $method = 'GET', $xhr = true) {
    global $base;
    $headers = array_merge(['Connection: close'], $xhr ? ['X-Requested-With: XMLHttpRequest'] : [], $extra);
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers),
        'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 5]]);
    $body = file_get_contents($base . '/endpoint?feature=stream-sources' . $query, false, $context);
    $headers = $http_response_header ?? [];
    preg_match('/^HTTP\/\S+ ([0-9]+)/', $headers[0] ?? '', $status);
    $data = json_decode((string) $body, true);
    sourceCheck(is_array($data), 'Toda resposta deve ser JSON sem conteúdo da página nativa.');
    foreach (['private-fixture-token', 'private-fixture-password', 'private-native-page', 'private-pdo-error'] as $secret) {
        sourceCheck(strpos($body, $secret) === false, 'A resposta não deve incluir detalhes privados.');
    }
    return [(int) ($status[1] ?? 0), $data, $headers];
}

try {
    copy(dirname(__DIR__) . '/xui-naxx/src/stream-source-api.php', $fixture . '/stream-source-api.php');
    file_put_contents($fixture . '/router.php', <<<'PHP'
<?php
$untrustedGroupBeforeBootstrap = ['is_admin' => '1', 'is_reseller' => '0', 'group_id' => '1'];
$_SESSION = $untrustedGroupBeforeBootstrap;
require __DIR__ . '/stream-source-api.php';
PHP
    );
    file_put_contents($fixture . '/streams.php', <<<'PHP'
<?php
$fixtureAccess = $_SERVER['HTTP_X_FIXTURE_ACCESS'] ?? '';
if ($_GET || $_POST || $_REQUEST) throw new RuntimeException('Parâmetros do filtro atingiram o núcleo.');
if ($fixtureAccess === 'exit-login') { header('Location: /login'); exit; }
if ($fixtureAccess === 'redirect') header('Location: /license');
if ($fixtureAccess === 'status') http_response_code(403);
$fixtureLanguages = ['is_admin' => 'Administrator', 'is_reseller' => 'Reseller'];
if ($fixtureAccess !== 'missing-group') {
    $fixtureNativeGroup = ['is_admin' => '1', 'is_reseller' => '0', 'group_id' => '1'];
    if ($fixtureAccess === 'reseller') $fixtureNativeGroup['is_reseller'] = '1';
    if ($fixtureAccess === 'other-group') $fixtureNativeGroup['group_id'] = '2';
    if ($fixtureAccess === 'not-admin') $fixtureNativeGroup['is_admin'] = '0';
    if ($fixtureAccess === 'loose-enum') $fixtureNativeGroup['is_admin'] = '01';
    if ($fixtureAccess === 'ambiguous') $fixtureAnotherGroup = ['is_admin' => '0', 'is_reseller' => '1', 'group_id' => '8'];
}
echo str_pad('private-native-page', 8190, ' '), '<ta';
echo $fixtureAccess === 'missing-table' ? 'ble data-id="datatable-streampage"></table>' : 'ble id="datatable-streampage"></table>';

class SourceFixturePdo extends PDO {
    public function __construct() {}
    public function setAttribute($attribute, $value): bool { return true; }
    public function prepare($query, $options = []): PDOStatement {
        if (($_SERVER['HTTP_X_FIXTURE_ACCESS'] ?? '') === 'database-error') throw new RuntimeException('private-pdo-error');
        if ($query !== 'SELECT id, stream_source FROM streams WHERE type = 1 AND id > ? ORDER BY id LIMIT 500') {
            throw new RuntimeException('A consulta precisa ser somente leitura, de canais ao vivo e paginada pelo ID.');
        }
        return new SourceFixtureStatement();
    }
}
class SourceFixtureStatement extends PDOStatement {
    private $rows = [];
    public function __construct() {}
    public function execute($params = null): bool {
        $after = $params[0] ?? -1;
        $count = (int) ($_SERVER['HTTP_X_FIXTURE_CATALOG'] ?? 504);
        $entries = [
            1 => ['https://user:private-fixture-password@FOO.EXAMPLE.:8443/live?token=private-fixture-token', 'rtsp://foo.example/backup'],
            2 => ['udp://[2001:0DB8:0:0:0:0:0:000A]:1234/x', 'https://192.0.2.20/path'],
            3 => ['https://foo.example.evil/live', 'https://other.example/a?next=https://foo.example/path'],
            4 => ['not-a-url', 'http://invalid host/path', null, ['malformed' => true]],
            501 => ['https://foo.example/reserve', 'https://private-fixture-token@other.example/stream#private-fixture-token']
        ];
        $this->rows = [];
        for ($id = $after + 1; $id <= min($after + 500, $count); $id++) {
            $source = $id === 5 ? '{"0":"https://invalid-object.example/path"}' : json_encode($entries[$id] ?? ['https://repeat.example/path']);
            $this->rows[] = ['id' => $id, 'stream_source' => $source];
        }
        return true;
    }
    public function fetchAll($mode = PDO::FETCH_DEFAULT, ...$args): array { return $this->rows; }
    public function closeCursor(): bool { $this->rows = []; return true; }
}
class Database { public $dbh; public function __construct() { $this->dbh = new SourceFixturePdo(); } }
if ($fixtureAccess !== 'missing-database') $fixtureDatabase = new Database();
PHP
    );

    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if (!$socket) throw new RuntimeException('Não foi possível reservar uma porta local.');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    $base = 'http://' . $address;
    $log = $fixture . '/server.log';
    $process = proc_open([PHP_BINARY, '-S', $address, '-t', $fixture, $fixture . '/router.php'],
        [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, $fixture);
    if (!is_resource($process)) throw new RuntimeException('Não foi possível iniciar o PHP local.');
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $connection = @stream_socket_client('tcp://' . $address, $errno, $errstr, 0.1);
        if ($connection) { fclose($connection); $ready = true; break; }
        usleep(100000);
    }
    sourceCheck($ready, 'Servidor local de teste não iniciou.');

    [$status, $body, $headers] = sourceRequest();
    sourceCheck($status === 200 && $body === ['ok' => true,
        'hosts' => ['192.0.2.20', '[2001:db8::a]', 'foo.example', 'foo.example.evil', 'other.example', 'repeat.example']],
        'A lista deve conter somente hosts válidos, canônicos, únicos e ordenados.');
    sourceCheck(in_array('Cache-Control: no-store', $headers, true), 'A resposta não deve ficar em cache.');

    foreach (['FOO.EXAMPLE.' => [1, 501], '[2001:DB8:0:0:0:0:0:A]' => [2], '2001:db8::a' => [2],
        '192.0.2.20' => [2], 'absent.example' => []] as $host => $expected) {
        [$status, $body] = sourceRequest('&host=' . rawurlencode($host));
        sourceCheck($status === 200 && $body === ['ok' => true, 'ids' => $expected], 'IDs devem corresponder ao host exato em todas as páginas.');
    }
    foreach (['', 'https://foo.example', 'foo.example:443', 'foo.example/path', 'foo.example?key=private-fixture-token',
        'user@foo.example', '999.999.999.999', '[2001:db8::a]:443', 'foo.example%00'] as $invalid) {
        [$status] = sourceRequest('&host=' . rawurlencode($invalid));
        sourceCheck($status === 400, 'Host inválido deve ser recusado.');
    }
    [$status] = sourceRequest('&host[]=foo.example');
    sourceCheck($status === 400, 'O host não pode ser um array.');

    foreach (['exit-login', 'redirect', 'status', 'missing-table', 'missing-group', 'not-admin', 'reseller', 'other-group', 'loose-enum', 'ambiguous'] as $auth) {
        [$status, $body, $headers] = sourceRequest('&is_admin=1&is_reseller=0&group_id=1', ['X-Fixture-Access: ' . $auth]);
        sourceCheck($status === 403 && $body['ok'] === false && !isset($body['hosts']), 'Sem grupo administrativo integral e página autorizada, não deve haver dados.');
        sourceCheck(!preg_grep('/^Location:/i', $headers), 'O redirecionamento nativo não deve passar à resposta JSON.');
    }
    [$status] = sourceRequest('', [], 'GET', false);
    sourceCheck($status === 403, 'A consulta exige o cabeçalho AJAX.');
    [$status] = sourceRequest('', ['Sec-Fetch-Site: cross-site']);
    sourceCheck($status === 403, 'Origem cruzada deve ser recusada.');
    [$status] = sourceRequest('', [], 'POST');
    sourceCheck($status === 405, 'A rota é somente GET.');
    foreach (['missing-database', 'database-error'] as $auth) {
        [$status] = sourceRequest('', ['X-Fixture-Access: ' . $auth]);
        sourceCheck($status === 503, 'Falha de banco deve retornar mensagem pública.');
    }

    [$status, $body] = sourceRequest('&host=absent.example', ['X-Fixture-Catalog: 50000']);
    sourceCheck($status === 200 && $body === ['ok' => true, 'ids' => []], 'O limite de 50.000 deve ser inclusivo.');
    [$status, $body] = sourceRequest('&host=foo.example', ['X-Fixture-Catalog: 50001']);
    sourceCheck($status === 413 && !isset($body['ids']) && strpos($body['message'], '50.000') !== false, 'Exceder o limite deve falhar sem lista parcial.');
    echo "Fontes dos canais: {$checks} verificações passaram com autenticação e banco simulados.\n";
} finally {
    if (is_resource($process)) { proc_terminate($process); proc_close($process); }
    foreach (['stream-source-api.php', 'router.php', 'streams.php', 'server.log'] as $file) {
        if (is_file($fixture . '/' . $file)) unlink($fixture . '/' . $file);
    }
    rmdir($fixture);
}
