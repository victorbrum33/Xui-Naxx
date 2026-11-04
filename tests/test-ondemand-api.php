<?php
// Endpoint real em servidor PHP temporário; autenticação nativa e PDO são fixtures locais.
$project = dirname(__DIR__) . '/xui-naxx';
$fixture = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'naxx-od-api-' . bin2hex(random_bytes(8));
if (!mkdir($fixture, 0700)) throw new RuntimeException('Não foi possível criar a fixture.');
$checks = 0; $process = null; $cookie = '';
function naxxOdApiAssert($condition, $message) {
    global $checks;
    $checks++;
    if (!$condition) throw new RuntimeException($message);
}
function naxxOdApiState($change = null) {
    global $fixture;
    $path = $fixture . '/state.json';
    $state = json_decode(file_get_contents($path), true);
    if ($change) { $state = $change($state); file_put_contents($path, json_encode($state)); }
    return $state;
}
function naxxOdApiRequest($method, $query = 'id=41', $body = null, $extra = [], $standard = true) {
    global $base, $cookie;
    $headers = ['Connection: close'];
    if ($cookie !== '') $headers[] = 'Cookie: ' . $cookie;
    if ($method === 'POST') $headers[] = 'Content-Type: application/json';
    if ($standard && $method === 'POST') {
        $headers[] = 'Origin: ' . $base;
        $headers[] = 'X-Requested-With: XMLHttpRequest';
    }
    foreach ($extra as $header) $headers[] = $header;
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers),
        'content' => is_array($body) ? json_encode($body) : (string) $body, 'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 5]]);
    $text = file_get_contents($base . '/endpoint?' . $query, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+ ([0-9]+)/', $header, $match)) $status = (int) $match[1];
        if (preg_match('/^Set-Cookie: ([^;]+)/i', $header, $match)) $cookie = $match[1];
    }
    $json = json_decode((string) $text, true);
    naxxOdApiAssert(is_array($json), 'O endpoint deve retornar somente JSON, sem HTML ou dados internos.');
    return ['status' => $status, 'data' => $json, 'text' => $text, 'headers' => $responseHeaders];
}

try {
    // Os ensaios de fallback usam um override vazio explícito, não ausência de capacidades.
    $capFile = $fixture . '/naxx-ondemand-capabilities.json';
    file_put_contents($capFile, '{}');
    copy($project . '/src/ondemand-api.php', $fixture . '/ondemand-api.php');
    copy($project . '/src/ondemand-policy.php', $fixture . '/ondemand-policy.php');
    file_put_contents($fixture . '/router.php', '<?php require __DIR__."/ondemand-policy.php"; require __DIR__."/ondemand-api.php";');
    file_put_contents($fixture . '/stream.php', <<<'PHP'
<?php
session_save_path(__DIR__);
session_start();
// Reproduz a conversão observada no bootstrap nativo depois de recarregar a sessão.
foreach (($_SESSION['naxx_od_plans'] ?? []) as $fixturePlanId => $fixturePlan) {
    foreach (['mode', 'previous_mode'] as $fixtureModeKey) {
        if (isset($fixturePlan[$fixtureModeKey]) && is_int($fixturePlan[$fixtureModeKey]))
            $_SESSION['naxx_od_plans'][$fixturePlanId][$fixtureModeKey] = (string) $fixturePlan[$fixtureModeKey];
    }
}
if (($_SERVER['HTTP_X_FIXTURE_CAPABILITIES'] ?? '') === 'missing') putenv('NAXX_OD_CAPABILITIES=' . __DIR__ . '/missing-capabilities.json');
else putenv('NAXX_OD_CAPABILITIES');
if (($_SERVER['HTTP_X_FIXTURE_AUTH'] ?? '') === 'redirect') { header('Location: /login'); exit; }
if (($_SERVER['HTTP_X_FIXTURE_AUTH'] ?? '') === 'denied') { echo '<p>Sem permissão</p>'; return; }
class NaxxOdFixtureMissingTable extends PDOException {
    public function __construct() { parent::__construct('Fixture sem tabela de perfis'); $this->code = '42S02'; }
}
class NaxxOdFixturePdo extends PDO {
    public $state; public $backup = null;
    public function __construct() { $this->state = json_decode(file_get_contents(__DIR__ . '/state.json'), true); }
    public function save() { file_put_contents(__DIR__ . '/state.json', json_encode($this->state)); }
    public function setAttribute($attribute, $value): bool { return true; }
    public function prepare($query, $options = []): PDOStatement { return new NaxxOdFixtureStatement($this, $query); }
    #[ReturnTypeWillChange]
    public function exec($query) {
        if (strpos($query, 'CREATE TABLE') !== 0) throw new RuntimeException('DDL inesperado');
        $this->state['table'] = true; $this->state['ddl']++; $this->save(); return 0;
    }
    public function beginTransaction(): bool { $this->backup = $this->state; return true; }
    public function inTransaction(): bool { return $this->backup !== null; }
    public function rollBack(): bool { $this->state = $this->backup; $this->backup = null; $this->save(); return true; }
    public function commit(): bool { $this->backup = null; $this->save(); return true; }
}
class NaxxOdFixtureStatement extends PDOStatement {
    private $db; private $sql; private $result = [];
    public function __construct($db, $sql) { $this->db = $db; $this->sql = $sql; }
    public function execute($params = null): bool {
        $state =& $this->db->state; $id = (string) ($params[0] ?? '');
        if (strpos($this->sql, 'SELECT id, uuid, stream_source') === 0) {
            $this->result = isset($state['streams'][$id]) ? [$state['streams'][$id]] : [];
        } elseif (strpos($this->sql, 'SELECT DISTINCT server_id') === 0) {
            $this->result = $state['servers'][$id] ?? [];
        } elseif (strpos($this->sql, 'SELECT a.argument_key') === 0) {
            $this->result = [];
            foreach (['user_agent', 'proxy', 'cookie', 'headers'] as $key) {
                $this->result[] = ['argument_key' => $key, 'argument_default_value' => $key === 'user_agent' ? 'Mozilla/5.0' : null,
                    'value' => $state['fetch'][$id][$key] ?? null];
            }
        } elseif (strpos($this->sql, 'SELECT * FROM naxx_ondemand_profiles') === 0) {
            if (!$state['table']) throw new NaxxOdFixtureMissingTable();
            $this->result = isset($state['profiles'][$id]) ? [$state['profiles'][$id]] : [];
        } elseif (strpos($this->sql, 'INSERT INTO naxx_ondemand_profiles') === 0) {
            if ($params[6] === null) throw new PDOException('format_name não pode ser NULL');
            $keys = ['stream_id', 'stream_uuid', 'source_hash', 'effective_mode', 'previous_mode', 'reason', 'format_name', 'verified'];
            $state['profiles'][$id] = array_combine($keys, $params); $state['writes']++;
            if (!$this->db->inTransaction()) $this->db->save();
        } elseif (strpos($this->sql, 'DELETE FROM naxx_ondemand_profiles') === 0) {
            if (($state['profiles'][$id]['stream_uuid'] ?? null) === ($params[1] ?? null)) unset($state['profiles'][$id]);
            $state['writes']++; $this->db->save();
        } else { throw new RuntimeException('SQL inesperado na fixture'); }
        return true;
    }
    #[ReturnTypeWillChange]
    public function fetch($mode = PDO::FETCH_DEFAULT, $cursorOrientation = PDO::FETCH_ORI_NEXT, $cursorOffset = 0) { return array_shift($this->result) ?: false; }
    public function fetchAll($mode = PDO::FETCH_DEFAULT, ...$args): array { return $this->result; }
}
class Database { public $dbh; public function __construct() { $this->dbh = new NaxxOdFixturePdo(); } }
$fixtureDatabase = new Database();
$id = (int) ($_GET['id'] ?? 0);
if (isset($_SESSION['naxx_od_plans'][(string) $id]) && in_array($_SERVER['HTTP_X_FIXTURE_PLAN_FIELD'] ?? '', ['mode', 'previous_mode'], true)
    && isset($_SERVER['HTTP_X_FIXTURE_PLAN_VALUE'])) {
    $fixturePlanValue = json_decode($_SERVER['HTTP_X_FIXTURE_PLAN_VALUE'], true);
    if (json_last_error() === JSON_ERROR_NONE)
        $_SESSION['naxx_od_plans'][(string) $id][$_SERVER['HTTP_X_FIXTURE_PLAN_FIELD']] = $fixturePlanValue;
}
$fixtureNativeState = $fixtureDatabase->dbh->state;
if (!isset($fixtureNativeState['streams'][(string) $id])) { echo '<select id="llod"></select>'; return; }
if (($_SERVER['HTTP_X_FIXTURE_AUTH'] ?? '') !== 'readonly') echo '<select id="llod"><option value="0">Desativado</option></select>';
echo '<input type="hidden" name="edit" value="' . (($_SERVER['HTTP_X_FIXTURE_AUTH'] ?? '') === 'wrongid' ? $id + 1 : $id) . '">';
PHP
    );
    $source = 'https://fixture.example/live?secret=naxx-private-source';
    $row = ['id' => 41, 'uuid' => 'uuid-fixture-41', 'stream_source' => json_encode([$source]), 'llod' => 0,
        'enable_transcode' => 0, 'transcode_profile_id' => 0, 'custom_ffmpeg' => '', 'direct_source' => 0, 'delay_minutes' => 0];
    $rows = [];
    foreach (range(41, 51) as $id) { $copy = $row; $copy['id'] = $id; $copy['uuid'] = 'uuid-fixture-' . $id; $rows[$id] = $copy; }
    file_put_contents($fixture . '/state.json', json_encode(['table' => false, 'ddl' => 0, 'writes' => 0,
        'streams' => $rows, 'servers' => array_fill_keys(range(41, 51), [1]), 'profiles' => [], 'fetch' => []]));
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if (!$socket) throw new RuntimeException('Não foi possível reservar uma porta local.');
    $address = stream_socket_get_name($socket, false); fclose($socket);
    $base = 'http://' . $address;
    $descriptors = [0 => ['pipe', 'r'], 1 => ['file', $fixture . '/server.log', 'a'], 2 => ['file', $fixture . '/server.log', 'a']];
    $process = proc_open([PHP_BINARY, '-S', $address, '-t', $fixture, $fixture . '/router.php'], $descriptors, $pipes, $fixture);
    if (!is_resource($process)) throw new RuntimeException('Não foi possível iniciar PHP CLI isolado.');
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $connection = @stream_socket_client('tcp://' . $address, $errno, $errstr, 0.1);
        if ($connection) { fclose($connection); $ready = true; break; }
        usleep(100000);
    }
    naxxOdApiAssert($ready, 'Servidor de teste não iniciou.');

    // Status autentica e devolve somente campos públicos, sem criar schema.
    $status = naxxOdApiRequest('GET');
    naxxOdApiAssert($status['status'] === 200 && $status['data']['ok'], 'Status autorizado deve funcionar.');
    $csrf = $status['data']['csrf'];
    naxxOdApiAssert(is_string($csrf) && strlen($csrf) === 64, 'Sessão deve receber CSRF imprevisível.');
    naxxOdApiAssert($status['data']['capabilities'] === [], 'Override vazio deve desativar modos validados explicitamente.');
    naxxOdApiAssert(naxxOdApiState()['ddl'] === 0 && !naxxOdApiState()['table'], 'Consultar status não pode criar tabela.');
    foreach (['stream_source', 'source_hash', 'stream_uuid', 'naxx-private-source', 'fixture.example'] as $private) {
        naxxOdApiAssert(strpos($status['text'], $private) === false, 'Status não deve devolver dados internos de fontes.');
    }
    foreach (['denied', 'readonly', 'wrongid', 'redirect'] as $gate) {
        $response = naxxOdApiRequest('GET', 'id=41', null, ['X-Fixture-Auth: ' . $gate]);
        naxxOdApiAssert($response['status'] === 403, 'Gate nativo deve recusar acesso sem formulário de edição autorizado.');
    }
    naxxOdApiAssert(naxxOdApiRequest('GET', 'id=999')['status'] === 403, 'Canal ainda não salvo ou inexistente não pode ser configurado.');
    naxxOdApiAssert(naxxOdApiRequest('GET', 'id=0')['status'] === 400, 'ID zero deve ser recusado.');
    naxxOdApiAssert(naxxOdApiRequest('PUT')['status'] === 405, 'Métodos não permitidos devem ser recusados.');

    $draft = ['sources' => [$source], 'flags' => ['transcode' => false, 'direct_source' => false, 'custom_ffmpeg' => '', 'delay' => 0], 'on_demand_servers' => [1]];
    $probe = ['format' => ['format_name' => 'mpegts'], 'streams' => [['codec_type' => 'video', 'codec_name' => 'h264'], ['codec_type' => 'audio', 'codec_name' => 'aac']]];
    $planBody = ['action' => 'plan', 'id' => 41, 'csrf' => $csrf, 'draft' => $draft, 'observations' => [$probe]];
    foreach ([['Origin: https://atacante.example', 'X-Requested-With: XMLHttpRequest'], ['Origin: ' . $base], []] as $headers) {
        naxxOdApiAssert(naxxOdApiRequest('POST', '', $planBody, $headers, false)['status'] === 403, 'Origem ou cabeçalho ausente/incorreto deve bloquear POST.');
    }
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $planBody, ['Sec-Fetch-Site: cross-site'])['status'] === 403, 'POST cross-site deve ser recusado.');
    $wrongCsrf = $planBody; $wrongCsrf['csrf'] = str_repeat('0', 64);
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $wrongCsrf)['status'] === 403, 'CSRF incorreto deve ser recusado mesmo com origem correta.');
    naxxOdApiAssert(naxxOdApiRequest('POST', '', '{')['status'] === 400, 'JSON malformado deve ser recusado.');
    naxxOdApiAssert(naxxOdApiState()['writes'] === 0 && naxxOdApiState()['ddl'] === 0, 'Requisições negadas não podem alterar schema ou perfis.');

    $plan = naxxOdApiRequest('POST', '', $planBody);
    naxxOdApiAssert($plan['status'] === 200 && in_array($plan['data']['plan']['mode'], [0, 1, 2], true), 'Plano deve usar somente modos nativos.');
    if (!$status['data']['capabilities']) naxxOdApiAssert($plan['data']['plan']['mode'] === 0, 'Capacidades ausentes devem planejar somente modo convencional.');
    // Simula salvar o formulário pelo mecanismo nativo antes de confirmar o perfil.
    $row['llod'] = $plan['data']['plan']['mode'];
    naxxOdApiState(function ($state) use ($row) { $state['streams'][41] = $row; return $state; });
    foreach (['source_hash', 'stream_uuid', 'naxx-private-source', 'fixture.example'] as $private) {
        naxxOdApiAssert(strpos($plan['text'], $private) === false, 'Plano público não deve expor fontes ou identidade interna.');
    }
    $commit = ['action' => 'commit', 'id' => 41, 'csrf' => $csrf, 'nonce' => $plan['data']['plan']['nonce']];
    $badNonce = $commit; $badNonce['nonce'] = str_repeat('0', 64);
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $badNonce)['status'] === 409, 'Commit exige o nonce do plano da sessão.');
    naxxOdApiState(function ($state) { $state['streams'][41]['stream_source'] = '["https://reserva.example/alterada"]'; return $state; });
    $sourceConflict = naxxOdApiRequest('POST', '', $commit);
    naxxOdApiAssert($sourceConflict['status'] === 409 && $sourceConflict['data']['conflict'] === 'analysis', 'Commit deve recusar fonte alterada após análise com código seguro.');
    naxxOdApiAssert(naxxOdApiState()['writes'] === 0, 'Mismatch não pode persistir perfil.');
    foreach (['enable_transcode', 'custom_ffmpeg', 'direct_source', 'delay_minutes'] as $flag) {
        naxxOdApiState(function ($state) use ($row, $flag) { $state['streams'][41] = $row; $state['streams'][41][$flag] = $flag === 'custom_ffmpeg' ? '-c:v copy' : 1; return $state; });
        naxxOdApiAssert(naxxOdApiRequest('POST', '', $commit)['status'] === 409, 'Commit deve recusar flags alteradas após análise.');
    }
    naxxOdApiState(function ($state) use ($row) { $state['streams'][41] = $row; $state['fetch'][41]['headers'] = 'X-Test: private-header'; return $state; });
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $commit)['status'] === 409, 'Alterar cabeçalhos de acesso após analisar deve invalidar o plano.');
    naxxOdApiState(function ($state) { $state['fetch'][41] = []; return $state; });
    naxxOdApiState(function ($state) use ($row) { $state['streams'][41] = $row; $state['streams'][41]['uuid'] = 'uuid-reutilizado'; return $state; });
    $identityConflict = naxxOdApiRequest('POST', '', $commit);
    naxxOdApiAssert($identityConflict['status'] === 409 && $identityConflict['data']['conflict'] === 'identity', 'ID reutilizado com UUID novo deve invalidar plano antigo.');
    naxxOdApiState(function ($state) use ($row) { $state['streams'][41] = $row; return $state; });
    naxxOdApiState(function ($state) { $state['servers'][41] = []; return $state; });
    $serverConflict = naxxOdApiRequest('POST', '', $commit);
    naxxOdApiAssert($serverConflict['status'] === 409 && $serverConflict['data']['conflict'] === 'servers', 'Sem servidor sob demanda, commit deve recusar sem expor estado privado.');
    naxxOdApiState(function ($state) { $state['servers'][41] = [1]; $state['streams'][41]['llod'] = 1; return $state; });
    $modeConflict = naxxOdApiRequest('POST', '', $commit);
    naxxOdApiAssert($modeConflict['status'] === 409 && $modeConflict['data']['conflict'] === 'mode', 'Modo diferente do plano deve retornar conflito seguro.');
    naxxOdApiState(function ($state) { $state['streams'][41]['llod'] = 0; return $state; });
    $success = naxxOdApiRequest('POST', '', $commit);
    naxxOdApiAssert($success['status'] === 200 && $success['data']['profile']['active'], 'Commit só deve persistir com identidade e fingerprint correspondentes.');
    naxxOdApiAssert(naxxOdApiState()['writes'] === 1, 'Commit válido deve gravar um perfil.');
    naxxOdApiAssert(naxxOdApiState()['streams'][41]['llod'] === $row['llod'], 'Endpoint não deve alterar o modo nativo.');
    naxxOdApiState(function ($state) { $state['fetch'][41]['cookie'] = 'private-cookie=value'; return $state; });
    $changedFetch = naxxOdApiRequest('GET');
    naxxOdApiAssert(!$changedFetch['data']['profile']['active'], 'Editar opções de acesso deve invalidar um perfil ativo.');
    naxxOdApiAssert(strpos($changedFetch['text'], 'private-cookie') === false && strpos($changedFetch['text'], 'Mozilla/5.0') === false, 'Status não deve expor opções de acesso ou credenciais.');
    naxxOdApiState(function ($state) { $state['fetch'][41] = []; return $state; });
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $commit)['status'] === 409, 'Nonce de plano confirmado não pode ser reutilizado.');
    naxxOdApiState(function ($state) { $state['servers'][41] = [2]; return $state; });
    naxxOdApiAssert(!naxxOdApiRequest('GET')['data']['profile']['active'], 'Alterar servidores deve invalidar a marca automática.');

    // Mais de oito canais não pode reindexar IDs dos planos ainda válidos.
    $firstPreservedNonce = null;
    foreach (range(42, 50) as $id) {
        $body = $planBody; $body['id'] = $id;
        $planned = naxxOdApiRequest('POST', '', $body);
        naxxOdApiAssert($planned['status'] === 200, 'Planejar outros canais deve funcionar.');
        if ($id === 43) $firstPreservedNonce = $planned['data']['plan']['nonce'];
    }
    $refreshBody = $planBody; $refreshBody['id'] = 49;
    $refreshed = naxxOdApiRequest('POST', '', $refreshBody);
    $preserved = naxxOdApiRequest('POST', '', ['action' => 'commit', 'id' => 43, 'csrf' => $csrf, 'nonce' => $firstPreservedNonce]);
    naxxOdApiAssert($preserved['status'] === 200, 'Reanalisar um canal já presente no limite de oito não pode expulsar outro plano.');
    $preserved = naxxOdApiRequest('POST', '', ['action' => 'commit', 'id' => 49, 'csrf' => $csrf, 'nonce' => $refreshed['data']['plan']['nonce']]);
    naxxOdApiAssert($preserved['status'] === 200, 'Limitar planos não pode reindexar ou perder IDs dos outros canais.');

    // Argumentos de acesso editados no mesmo Save são vinculados ao estado nativo confirmado.
    $fetchBody = $planBody; $fetchBody['id'] = 51;
    $fetchBody['draft']['flags']['fetch'] = ['user_agent' => 'FixtureAgent/1.0', 'proxy' => '', 'cookie' => 'private-cookie=value', 'headers' => 'X-Fixture: private-header'];
    $fetchPlan = naxxOdApiRequest('POST', '', $fetchBody);
    naxxOdApiAssert($fetchPlan['status'] === 200, 'Plano pode incluir novos argumentos ainda não salvos.');
    $fetchCommit = ['action' => 'commit', 'id' => 51, 'csrf' => $csrf, 'nonce' => $fetchPlan['data']['plan']['nonce']];
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $fetchCommit)['status'] === 409, 'Opções antigas no nativo não confirmam o novo plano.');
    naxxOdApiState(function ($state) use ($fetchBody) { $state['fetch'][51] = $fetchBody['draft']['flags']['fetch']; return $state; });
    naxxOdApiAssert(naxxOdApiRequest('POST', '', $fetchCommit)['status'] === 200, 'Após o Save nativo correspondente, os novos argumentos confirmam o perfil.');
    $fetchStatus = naxxOdApiRequest('GET', 'id=51');
    naxxOdApiAssert($fetchStatus['data']['profile']['active'] && strpos($fetchStatus['text'], 'private-cookie') === false && strpos($fetchStatus['text'], 'private-header') === false,
        'Perfil ativo nunca devolve as credenciais de acesso usadas na assinatura.');

    // Capacidades validadas carregadas de arquivo local habilitam a promoção para v2/v3.
    naxxOdApiState(function ($state) use ($row) { $state['streams'][41] = $row; return $state; });
    file_put_contents($capFile, json_encode(['mpegts' => ['modes' => [0, 1, 2], 'video_codecs' => ['h264'], 'audio_codecs' => ['aac']]]));
    $withCaps = naxxOdApiRequest('GET');
    naxxOdApiAssert($withCaps['status'] === 200 && isset($withCaps['data']['capabilities']['mpegts']), 'Status deve expor as capacidades validadas quando o arquivo existe.');
    $capPlan = naxxOdApiRequest('POST', '', ['action' => 'plan', 'id' => 41, 'csrf' => $csrf, 'draft' => $draft, 'observations' => [$probe]]);
    naxxOdApiAssert($capPlan['status'] === 200 && $capPlan['data']['plan']['mode'] === 2 && $capPlan['data']['plan']['verified'] === true, 'Com capacidades e análise válidas, o plano deve promover para o modo nativo preferido.');
    file_put_contents($capFile, '[1,2,3]');
    naxxOdApiAssert(!naxxOdApiRequest('GET')['data']['capabilities'], 'Arquivo de capacidades inválido (lista) deve cair para o vazio seguro.');
    file_put_contents($capFile, json_encode(['private_token' => 'fixture-private-value']));
    $invalidCapabilities = naxxOdApiRequest('GET');
    naxxOdApiAssert(!$invalidCapabilities['data']['capabilities'] && strpos($invalidCapabilities['text'], 'fixture-private-value') === false,
        'Override malformado não pode expor campos arbitrários de configuração.');
    file_put_contents($capFile, '{}');
    naxxOdApiAssert(naxxOdApiRequest('GET')['data']['capabilities'] === [], 'Um objeto vazio desativa os defaults da versão.');
    unlink($capFile);
    $defaults = naxxOdApiRequest('GET')['data']['capabilities'];
    naxxOdApiAssert($defaults['mpegts'] === ['modes' => [0, 1, 2], 'video_codecs' => ['h264'], 'audio_codecs' => ['aac']], 'Sem override, TS H.264/AAC usa somente os três modos ensaiados.');
    naxxOdApiAssert($defaults['hls'] === ['modes' => [0, 1], 'video_codecs' => ['h264'], 'audio_codecs' => ['aac']], 'HLS não pode autorizar o modo2 que falhou no ensaio.');
    naxxOdApiAssert(naxxOdApiRequest('GET', 'id=41', null, ['X-Fixture-Capabilities: missing'])['data']['capabilities'] === [],
        'Um override de ambiente explícito ausente não pode reativar os defaults silenciosamente.');

    // Strings numéricas exatas sobrevivem ao bootstrap; coerções ambíguas nunca viram modos.
    foreach (['mode', 'previous_mode'] as $sessionField) {
        foreach (['02', '3', '2evil', true, [], null, -1] as $invalidMode) {
            $sessionBody = $planBody; $sessionBody['id'] = 50;
            $sessionPlan = naxxOdApiRequest('POST', '', $sessionBody);
            $sessionCommit = ['action' => 'commit', 'id' => 50, 'csrf' => $csrf, 'nonce' => $sessionPlan['data']['plan']['nonce']];
            $sessionConflict = naxxOdApiRequest('POST', '', $sessionCommit,
                ['X-Fixture-Plan-Field: ' . $sessionField, 'X-Fixture-Plan-Value: ' . json_encode($invalidMode)]);
            naxxOdApiAssert($sessionConflict['status'] === 409 && $sessionConflict['data']['conflict'] === 'mode',
                'Enums inválidos da sessão devem ser recusados sem intval permissivo.');
        }
    }

    echo 'Endpoint on-demand: ' . $checks . " verificações passaram com autenticação e PDO simulados; sem VM ou banco nativo.\n";
} finally {
    if (is_resource($process)) { proc_terminate($process); proc_close($process); }
    foreach (scandir($fixture) as $name) {
        if ($name !== '.' && $name !== '..' && is_file($fixture . DIRECTORY_SEPARATOR . $name)) unlink($fixture . DIRECTORY_SEPARATOR . $name);
    }
    rmdir($fixture);
}
