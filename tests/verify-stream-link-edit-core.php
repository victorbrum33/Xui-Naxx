<?php
// Portable integration checks: no network, no production database, no PDO driver required.
require dirname(__DIR__) . '/xui-naxx/src/stream-link-edit-core.php';

class NaxxLinkTestDb {
    public $rows = [];
    public $queries = [];
    public $writes = 0;
    public $failWrite = 0;
    public $beforeFullRead = null;
    private $snapshot = null;
    public function __construct(array $rows) { foreach ($rows as $row) $this->rows[(string) $row['id']] = $row; }
    public function prepare($sql) { $this->queries[] = $sql; return new NaxxLinkTestStatement($this, $sql); }
    public function beginTransaction() { if ($this->snapshot !== null) throw new RuntimeException('nested transaction'); $this->snapshot = $this->rows; return true; }
    public function commit() { $this->snapshot = null; return true; }
    public function rollBack() { $this->rows = $this->snapshot; $this->snapshot = null; return true; }
    public function inTransaction() { return $this->snapshot !== null; }
}

class NaxxLinkTestStatement {
    private $db;
    private $sql;
    private $results = [];
    private $affected = 0;
    public function __construct($db, $sql) { $this->db = $db; $this->sql = $sql; }
    public function execute(array $values) {
        $this->results = [];
        $this->affected = 0;
        if (strpos($this->sql, 'SELECT ') === 0) {
            if (strpos($this->sql, 'WHERE type = 1 AND id IN (') === false) throw new RuntimeException('unscoped select');
            if (strpos($this->sql, 'FOR UPDATE') !== false && !$this->db->inTransaction()) throw new RuntimeException('lock outside transaction');
            if ($this->db->beforeFullRead !== null && strpos($this->sql, 'SELECT id, uuid,') === 0) {
                $callback = $this->db->beforeFullRead;
                $this->db->beforeFullRead = null;
                $callback($this->db);
            }
            foreach ($values as $id) if (isset($this->db->rows[$id]) && $this->db->rows[$id]['type'] === 1) $this->results[] = $this->db->rows[$id];
            usort($this->results, function ($a, $b) { return (int) $a['id'] <=> (int) $b['id']; });
            return true;
        }
        if (strpos($this->sql, 'UPDATE ') !== 0 || !$this->db->inTransaction() || strpos($this->sql, 'WHERE type = 1 AND id = ?') === false) throw new RuntimeException('unsafe update');
        if (!preg_match('/^UPDATE `[A-Za-z0-9_]+` SET ((?:stream_source = \?, )?(?:stream_icon = \?, )?updated = CURRENT_TIMESTAMP) WHERE type = 1 AND id = \?$/D', $this->sql)) throw new RuntimeException('unrelated field update');
        ++$this->db->writes;
        if ($this->db->failWrite && $this->db->writes === $this->db->failWrite) throw new RuntimeException('simulated database failure');
        $id = array_pop($values);
        if (!isset($this->db->rows[$id]) || $this->db->rows[$id]['type'] !== 1) return true;
        if (strpos($this->sql, 'stream_source = ?') !== false) $this->db->rows[$id]['stream_source'] = array_shift($values);
        if (strpos($this->sql, 'stream_icon = ?') !== false) $this->db->rows[$id]['stream_icon'] = array_shift($values);
        $this->db->rows[$id]['updated'] = 'changed';
        $this->affected = 1;
        return true;
    }
    public function fetch($mode = null) { return $this->results ? array_shift($this->results) : false; }
    public function closeCursor() { $this->results = []; return true; }
    public function rowCount() { return $this->affected; }
}

$checks = 0;
function naxxLinkTestAssert($condition, $label) {
    global $checks;
    ++$checks;
    if (!$condition) throw new RuntimeException('FAILED: ' . $label);
}
function naxxLinkTestError($code, callable $callback, $label) {
    try { $callback(); } catch (RuntimeException $error) { naxxLinkTestAssert($error->getCode() === $code, $label . ' (status)'); return; }
    throw new RuntimeException('FAILED: expected error: ' . $label);
}
function naxxLinkTestRow($id, $name = null, $type = 1) {
    return ['id' => (string) $id, 'type' => $type, 'uuid' => 'uuid-' . $id, 'stream_display_name' => $name === null ? 'Channel ' . $id : $name, 'stream_source' => '["http://old.example/' . $id . '?user=a&pass=b","rtmp://fallback.example/' . $id . '"]', 'stream_icon' => 'http://old.example/logo' . $id . '.png', 'category_id' => '[99]', 'direct_source' => 1, 'updated' => 'old'];
}

$testRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'naxx-link-core-' . bin2hex(random_bytes(8));
if (!mkdir($testRoot, 0700)) throw new RuntimeException('cannot create test directory');
$config = ['dir' => $testRoot . DIRECTORY_SEPARATOR . 'jobs', 'scope' => hash('sha256', 'session-a'), 'secret' => hash('sha256', 'secret-a')];
try {
    naxxLinkTestAssert(naxxLinkNameKey(" \tNEWS\u{00A0} HD\u{FEFF} ") === 'news hd', 'canonical whitespace and ASCII case');
    naxxLinkTestAssert(naxxLinkNameKey('ÁGUA 4K') === 'Água 4k', 'accents and quality preserved');
    naxxLinkTestAssert(naxxLinkNameKey('ÁGUA') !== naxxLinkNameKey('água'), 'non-ASCII case stays distinct');
    naxxLinkTestAssert(naxxLinkNameKey('HD') !== naxxLinkNameKey('FHD'), 'quality never fuzzy matched');
    naxxLinkTestAssert(naxxLinkNameKey(str_repeat('x', 1025)) === null && naxxLinkNameKey("bad\xFF") === null, 'bounded UTF8 names');
    naxxLinkTestAssert(naxxLinkIds(['9', 2, '2']) === ['2', '9'], 'canonical unique sorted IDs');
    naxxLinkTestError(422, function () { naxxLinkIds(['1 OR 1']); }, 'SQL ID injection rejected');
    naxxLinkTestError(422, function () { naxxLinkIds([]); }, 'empty selection rejected');
    naxxLinkTestError(503, function () { naxxLinkTable('streams;DELETE'); }, 'table injection rejected');
    foreach (['javascript:alert(1)', '//evil/logo', 'data:image/png;base64,AA', "https://ok/x\nno", 'file:///etc/passwd', 'https://ok/has space'] as $url) naxxLinkTestAssert(naxxLinkUrl($url, true) === null, 'unsafe logo URL rejected');
    naxxLinkTestAssert(naxxLinkUrl('/images/channel.png', true) === '/images/channel.png', 'root-relative logo');
    naxxLinkTestAssert(naxxLinkUrl(' srt://example.test:9000?streamid=abc ') === 'srt://example.test:9000?streamid=abc', 'media protocol and outer trim');
    naxxLinkTestAssert(naxxLinkUrl('udp://@239.0.0.1:1234') !== null, 'UDP multicast URL');
    naxxLinkTestAssert(naxxLinkSources('{"0":"http://a"}') === null && naxxLinkSources('[12]') === null, 'JSON object and nonstring sources rejected');

    $db = new NaxxLinkTestDb([naxxLinkTestRow(1), naxxLinkTestRow(2), naxxLinkTestRow(3, 'Movie', 2)]);
    naxxLinkTestError(422, function () use ($db) { naxxLinkCatalog($db, ['1', '3']); }, 'nonlive selection rejected');
    naxxLinkTestError(422, function () use ($db) { naxxLinkCatalog($db, ['1', '999']); }, 'missing selection rejected');
    $op = naxxLinkOperation(['kind' => 'replace', 'source' => ['find' => 'old.example', 'replace' => 'new.example'], 'logo' => ['mode' => 'replace', 'find' => 'old.example', 'replace' => 'cdn.example']]);
    $before = $db->rows;
    $preview = naxxLinkPreview($db, ['1', '2'], $op, $config);
    naxxLinkTestAssert($preview['summary']['changed'] === 2 && count($preview['changes']) === 2, 'preview selected changes');
    naxxLinkTestAssert($db->rows === $before && $db->writes === 0, 'preview never mutates database');
    naxxLinkTestAssert($preview['changes'][0]['new_sources'][1] === 'rtmp://fallback.example/1', 'literal replace preserves unmatched fallback');
    $result = naxxLinkApply($db, $preview['token'], 0, $config);
    naxxLinkTestAssert($result['done'] && $result['applied'] === 2 && $result['cache_pending'], 'transactional apply response');
    naxxLinkTestAssert($db->rows[1]['category_id'] === '[99]' && $db->rows[1]['direct_source'] === 1 && $db->rows[3] === $before[3], 'unrelated fields and nonlive rows untouched');
    $writes = $db->writes;
    naxxLinkTestAssert(naxxLinkApply($db, $preview['token'], 0, $config) === $result && $db->writes === $writes, 'same-cursor retry replays cached result');
    naxxLinkTestError(409, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 1, $config); }, 'unexpected cursor rejected');

    $db = new NaxxLinkTestDb([naxxLinkTestRow(1), naxxLinkTestRow(2)]);
    $preview = naxxLinkPreview($db, ['1', '2'], $op, $config);
    $db->rows[2]['stream_icon'] = 'https://other.example/concurrent.png';
    $before = $db->rows;
    naxxLinkTestError(409, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 0, $config); }, 'concurrent logo conflict');
    naxxLinkTestAssert($db->rows === $before && $db->writes === 0, 'entire conflicting batch unchanged');
    $db->rows[2] = naxxLinkTestRow(2);
    $db->failWrite = 2;
    try { naxxLinkApply($db, $preview['token'], 0, $config); } catch (RuntimeException $expected) {}
    naxxLinkTestAssert($db->rows[1] === naxxLinkTestRow(1) && $db->rows[2] === naxxLinkTestRow(2) && !$db->inTransaction(), 'database failure rolls back previous writes');
    $db->failWrite = 0;
    naxxLinkTestAssert(naxxLinkApply($db, $preview['token'], 0, $config)['done'], 'failed transaction can safely resume');

    $db = new NaxxLinkTestDb([naxxLinkTestRow(1)]);
    $preview = naxxLinkPreview($db, ['1'], $op, $config);
    $metaPath = $config['dir'] . DIRECTORY_SEPARATOR . $preview['token'] . '.meta';
    $oldMeta = file_get_contents($metaPath);
    naxxLinkApply($db, $preview['token'], 0, $config);
    file_put_contents($metaPath, $oldMeta); // Simulate commit success before the cursor was persisted.
    $writes = $db->writes;
    naxxLinkTestAssert(naxxLinkApply($db, $preview['token'], 0, $config)['done'] && $db->writes === $writes, 'commit-before-metadata retry recognizes exact desired rows');

    $rows = [naxxLinkTestRow(1, 'News HD'), naxxLinkTestRow(2, 'SAME'), naxxLinkTestRow(3, 'Same'), naxxLinkTestRow(4, 'Missing'), naxxLinkTestRow(5, 'Invalid'), naxxLinkTestRow(6, 'Import duplicate')];
    $db = new NaxxLinkTestDb($rows);
    $m3u = naxxLinkOperation(['kind' => 'm3u', 'update_source' => true, 'update_logo' => true, 'items' => [
        ['name' => ' NEWS   HD ', 'url' => 'https://new.example/live', 'logo' => ''],
        ['name' => 'Same', 'url' => 'https://new.example/same', 'logo' => ''],
        ['name' => 'Invalid', 'url' => 'javascript:bad', 'logo' => ''],
        ['name' => 'Import duplicate', 'url' => 'https://new.example/dup', 'logo' => ''],
        ['name' => 'IMPORT DUPLICATE', 'url' => 'https://new.example/dup', 'logo' => '']
    ]]);
    $preview = naxxLinkPreview($db, ['1', '2', '3', '4', '5', '6'], $m3u, $config);
    naxxLinkTestAssert($preview['summary'] === ['selected' => 6, 'changed' => 1, 'unchanged' => 0, 'unmatched' => 1, 'ambiguous' => 3, 'invalid' => 1], 'M3U duplicate, missing and invalid accounting');
    naxxLinkTestAssert(count($preview['issues']) === 5 && !$preview['issues_truncated'], 'review includes unchanged issue names and reasons');
    naxxLinkApply($db, $preview['token'], 0, $config);
    $sources = json_decode($db->rows[1]['stream_source'], true);
    naxxLinkTestAssert($sources === ['https://new.example/live', 'rtmp://fallback.example/1'] && $db->rows[1]['stream_icon'] === $rows[0]['stream_icon'], 'M3U primary URL only and empty logo preserves current');
    naxxLinkTestAssert(count($db->rows) === 6 && $db->rows[4] === $rows[3], 'M3U never creates a channel or changes unmatched channels');
    $db = new NaxxLinkTestDb([naxxLinkTestRow(1, 'News HD'), naxxLinkTestRow(2, 'Other')]);
    $db->beforeFullRead = function ($database) { $database->rows[2]['stream_display_name'] = 'News HD'; };
    $filesBeforeRace = iterator_count(new FilesystemIterator($config['dir'], FilesystemIterator::SKIP_DOTS));
    naxxLinkTestError(409, function () use ($db, $m3u, $config) { naxxLinkPreview($db, ['1', '2'], $m3u, $config); }, 'rename-to-duplicate between catalog and full read rejected');
    naxxLinkTestAssert(iterator_count(new FilesystemIterator($config['dir'], FilesystemIterator::SKIP_DOTS)) === $filesBeforeRace && $db->writes === 0, 'failed raced preview leaves no private plan or database writes');

    $db = new NaxxLinkTestDb([naxxLinkTestRow(1)]);
    $noChange = naxxLinkPreview($db, ['1'], naxxLinkOperation(['kind' => 'replace', 'source' => ['find' => 'absent', 'replace' => 'x']]), $config);
    naxxLinkTestAssert($noChange['token'] === null && $noChange['summary']['unchanged'] === 1, 'zero-change preview needs no apply token');
    $db->rows[1]['stream_source'] = "[ \n  \"http:\\/\\/old.example\\/1\" ]";
    $rawBefore = $db->rows[1]['stream_source'];
    $rawNoChange = naxxLinkChange($db->rows[1], naxxLinkOperation(['kind' => 'replace', 'source' => ['find' => 'absent', 'replace' => 'x']]));
    naxxLinkTestAssert($rawNoChange['status'] === 'unchanged' && $db->rows[1]['stream_source'] === $rawBefore, 'no-match operation preserves original JSON whitespace and escapes');
    $db->rows[1] = naxxLinkTestRow(1);
    $literal = naxxLinkChange(naxxLinkTestRow(1), naxxLinkOperation(['kind' => 'replace', 'source' => ['find' => '.example', 'replace' => '.new']]));
    naxxLinkTestAssert(strpos($literal['sample']['new_sources'][0], 'old.new') !== false && strpos($literal['sample']['new_sources'][1], 'fallback.new') !== false, 'find and replace is literal across every source');
    $invalid = naxxLinkPreview($db, ['1'], naxxLinkOperation(['kind' => 'replace', 'source' => ['find' => 'http://', 'replace' => 'javascript:']]), $config);
    naxxLinkTestAssert($invalid['summary']['invalid'] === 1 && $invalid['token'] === null, 'invalid produced link is skipped');
    $preview = naxxLinkPreview($db, ['1'], $op, $config);
    $other = $config;
    $other['scope'] = hash('sha256', 'session-b');
    naxxLinkTestError(403, function () use ($db, $preview, $other) { naxxLinkApply($db, $preview['token'], 0, $other); }, 'preview bound to session');
    $other['secret'] = hash('sha256', 'other secret');
    naxxLinkTestError(409, function () use ($db, $preview, $other) { naxxLinkApply($db, $preview['token'], 0, $other); }, 'signature bound to session secret');
    $planPath = $config['dir'] . DIRECTORY_SEPARATOR . $preview['token'] . '.plan';
    $planRaw = file_get_contents($planPath);
    file_put_contents($planPath, str_replace('new.example', 'bad.example', $planRaw));
    naxxLinkTestError(409, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 0, $config); }, 'same-size plan tamper detected');
    file_put_contents($planPath, $planRaw);
    naxxLinkDiscard($preview['token'], $config);
    naxxLinkTestAssert(!file_exists($planPath), 'discard removes private URL plan');
    naxxLinkTestError(410, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 0, $config); }, 'discarded preview cannot apply');
    naxxLinkTestError(422, function () use ($db, $config) { naxxLinkApply($db, '../../outside', 0, $config); }, 'token path traversal rejected');
    $preview = naxxLinkPreview($db, ['1'], $op, $config);
    $metaPath = $config['dir'] . DIRECTORY_SEPARATOR . $preview['token'] . '.meta';
    $meta = naxxLinkVerified(file_get_contents($metaPath), $preview['token'], $config['secret']);
    $meta['expires'] = time() - 1;
    $meta['created'] = $meta['expires'] - 1800;
    file_put_contents($metaPath, naxxLinkSigned($meta, $preview['token'], $config['secret']));
    naxxLinkTestError(410, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 0, $config); }, 'expired preview cannot apply');

    $oldTime = time() - 7200;
    $gcPaths = [];
    foreach (['a', 'b', 'c'] as $letter) {
        foreach (['plan', 'meta', 'lock'] as $extension) {
            $path = $config['dir'] . DIRECTORY_SEPARATOR . str_repeat($letter, 64) . '.' . $extension;
            file_put_contents($path, 'private test fixture');
            chmod($path, 0600);
            touch($path, $oldTime);
            $gcPaths[$letter][$extension] = $path;
        }
    }
    touch($gcPaths['b']['meta'], time());
    $busyLock = fopen($gcPaths['c']['lock'], 'r+b');
    flock($busyLock, LOCK_EX);
    $unknown = $config['dir'] . DIRECTORY_SEPARATOR . 'unrelated-file.txt';
    file_put_contents($unknown, 'keep');
    touch($unknown, $oldTime);
    $symlinkPath = $config['dir'] . DIRECTORY_SEPARATOR . str_repeat('d', 64) . '.plan';
    $symlinkMade = function_exists('symlink') && @symlink($unknown, $symlinkPath);
    naxxLinkGc($config['dir']);
    naxxLinkTestAssert(!file_exists($gcPaths['a']['plan']) && !file_exists($gcPaths['a']['meta']) && !file_exists($gcPaths['a']['lock']), 'GC removes aged owned inactive jobs');
    naxxLinkTestAssert(file_exists($gcPaths['b']['plan']) && file_exists($gcPaths['b']['meta']), 'GC preserves a job with any young file');
    naxxLinkTestAssert(file_exists($gcPaths['c']['plan']) && file_exists($gcPaths['c']['meta']), 'GC preserves a busy locked job');
    naxxLinkTestAssert(file_exists($unknown), 'GC ignores unrecognized files');
    if ($symlinkMade) naxxLinkTestAssert(is_link($symlinkPath) && file_exists($unknown), 'GC never follows or removes symlink jobs');
    flock($busyLock, LOCK_UN);
    fclose($busyLock);

    $rows = [];
    $ids = [];
    for ($id = 1; $id <= 501; ++$id) { $rows[] = naxxLinkTestRow($id); $ids[] = (string) $id; }
    $db = new NaxxLinkTestDb($rows);
    $preview = naxxLinkPreview($db, $ids, $op, $config);
    naxxLinkTestAssert(count($preview['changes']) === 100 && $preview['truncated'], 'preview samples bounded at 100');
    $first = naxxLinkApply($db, $preview['token'], 0, $config);
    naxxLinkTestAssert($first['applied'] === 250 && !$first['done'] && $db->writes === 250, 'first apply bounded to 250');
    $db->rows[501]['uuid'] = 'recreated-channel';
    $second = naxxLinkApply($db, $preview['token'], 250, $config);
    naxxLinkTestAssert($second['applied'] === 500 && !$second['done'], 'second independent batch commits');
    naxxLinkTestError(409, function () use ($db, $preview, $config) { naxxLinkApply($db, $preview['token'], 500, $config); }, 'recreated ID conflicts on later batch');
    naxxLinkTestAssert(strpos($db->rows[1]['stream_source'], 'new.example') !== false && strpos($db->rows[501]['stream_source'], 'old.example') !== false, 'earlier committed batches retained after later conflict');
    naxxLinkTestAssert(count(array_filter($db->queries, function ($sql) { return strpos($sql, 'FOR UPDATE') !== false; })) === 3, 'every applied batch locks selected live rows');
    echo 'OK ' . $checks . " checks: stream link edit core\n";
} finally {
    // Delete only this run's explicitly created temp directory; never follow symlinks.
    if (is_dir($config['dir'])) {
        foreach (new DirectoryIterator($config['dir']) as $entry) if (!$entry->isDot() && !$entry->isDir()) unlink($entry->getPathname());
        rmdir($config['dir']);
    }
    rmdir($testRoot);
}
