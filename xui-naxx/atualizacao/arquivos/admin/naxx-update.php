<?php
if (($_GET['feature'] ?? '') === 'stream-link-edit') {

// Helpers only. The authenticated endpoint supplies the PDO, session scope and fixed storage path.
function naxxLinkLimits() {
    return ['selected' => 50000, 'request_bytes' => 8388608, 'preview_rows' => 100, 'apply_batch' => 250, 'expires_seconds' => 1800];
}

function naxxLinkFail($status, $message, array $details = []) {
    $error = new RuntimeException(json_encode(['message' => $message] + $details, JSON_UNESCAPED_UNICODE), $status);
    throw $error;
}

function naxxLinkJson($value) {
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) naxxLinkFail(422, 'Os dados de um canal contêm texto inválido.');
    return $json;
}

function naxxLinkNameKey($name) {
    if (!is_string($name) || strlen($name) > 1024 || preg_match('//u', $name) !== 1 || preg_match('/[\x00-\x08\x0E-\x1F\x7F]/', $name)) return null;
    $name = preg_replace('/[\x{0009}-\x{000D}\x{0020}\x{0085}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+/u', ' ', $name);
    $name = trim($name, ' ');
    return $name === '' ? null : strtr($name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
}

function naxxLinkIds($ids) {
    if (!is_array($ids) || !$ids || count($ids) > 50000 || array_keys($ids) !== range(0, count($ids) - 1)) naxxLinkFail(422, 'Selecione entre 1 e 50.000 canais ao vivo.');
    $result = [];
    foreach ($ids as $id) {
        if ((!is_string($id) && !is_int($id)) || !preg_match('/^[1-9][0-9]{0,9}$/D', (string) $id) || (float) $id > 4294967295) naxxLinkFail(422, 'A seleção de canais está inválida.');
        $result[(string) $id] = (string) $id;
    }
    $result = array_values($result);
    usort($result, function ($a, $b) { return (int) $a <=> (int) $b; });
    return $result;
}

function naxxLinkTable($table) {
    if (!is_string($table) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/D', $table)) naxxLinkFail(503, 'Não foi possível acessar os canais.');
    return '`' . $table . '`';
}

function naxxLinkRead($db, array $ids, $table, $full, callable $visit, $lock = false) {
    $columns = $full ? 'id, uuid, stream_display_name, stream_source, stream_icon' : 'id, stream_display_name';
    foreach (array_chunk($ids, 500) as $batch) {
        $sql = 'SELECT ' . $columns . ' FROM ' . naxxLinkTable($table) . ' WHERE type = 1 AND id IN (' . implode(',', array_fill(0, count($batch), '?')) . ') ORDER BY id' . ($lock ? ' FOR UPDATE' : '');
        $query = $db->prepare($sql);
        $query->execute($batch);
        while ($row = $query->fetch(PDO::FETCH_ASSOC)) $visit($row);
        $query->closeCursor();
    }
}

function naxxLinkCatalog($db, array $ids, $table = 'streams') {
    $channels = [];
    naxxLinkRead($db, $ids, $table, false, function ($row) use (&$channels) {
        $channels[] = ['id' => (string) $row['id'], 'name' => (string) $row['stream_display_name'], 'match_key' => naxxLinkNameKey($row['stream_display_name'])];
    });
    if (count($channels) !== count($ids)) naxxLinkFail(422, 'A seleção contém canais ausentes ou que não são canais ao vivo. Atualize a lista e selecione novamente.');
    return $channels;
}

function naxxLinkUrl($value, $logo = false) {
    if (!is_string($value) || strlen($value) > 16384 || preg_match('//u', $value) !== 1 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) return null;
    $value = trim($value);
    if ($value === '' || preg_match('/[\x00-\x20\x7F\\\\]/', $value)) return null;
    if ($logo && substr($value, 0, 1) === '/' && substr($value, 0, 2) !== '//') return $value;
    $parts = parse_url($value);
    $schemes = $logo ? ['http', 'https'] : ['http', 'https', 'rtmp', 'rtmps', 'rtsp', 'rtsps', 'srt', 'udp', 'rtp'];
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host']) || !in_array(strtolower($parts['scheme']), $schemes, true) || strpos($value, '://') === false) return null;
    return $value;
}

function naxxLinkSources($raw) {
    if (!is_string($raw) || strlen($raw) > 1048576 || substr(ltrim($raw), 0, 1) !== '[') return null;
    $sources = json_decode($raw, true);
    if (!is_array($sources) || ($sources && array_keys($sources) !== range(0, count($sources) - 1))) return null;
    foreach ($sources as $source) if (!is_string($source)) return null;
    return $sources;
}

function naxxLinkText($value, $nonempty = false) {
    return is_string($value) && strlen($value) <= 16384 && (!$nonempty || $value !== '') && preg_match('//u', $value) === 1 && !preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value);
}

function naxxLinkOperation($operation) {
    if (!is_array($operation) || !isset($operation['kind'])) naxxLinkFail(422, 'Escolha uma operação válida.');
    if ($operation['kind'] === 'replace') {
        $result = ['kind' => 'replace'];
        if (isset($operation['source'])) {
            $source = $operation['source'];
            if (!is_array($source) || !naxxLinkText($source['find'] ?? null, true) || !naxxLinkText($source['replace'] ?? null)) naxxLinkFail(422, 'Preencha a busca e a substituição dos links.');
            $result['source'] = ['find' => $source['find'], 'replace' => $source['replace']];
        }
        if (isset($operation['logo'])) {
            $logo = $operation['logo'];
            if (!is_array($logo)) naxxLinkFail(422, 'A alteração de logos está inválida.');
            if (($logo['mode'] ?? '') === 'set') {
                $url = naxxLinkUrl($logo['url'] ?? null, true);
                if ($url === null) naxxLinkFail(422, 'Informe uma URL HTTP/HTTPS ou um caminho local válido para o logo.');
                $result['logo'] = ['mode' => 'set', 'url' => $url];
            } elseif (($logo['mode'] ?? '') === 'replace' && naxxLinkText($logo['find'] ?? null, true) && naxxLinkText($logo['replace'] ?? null)) {
                $result['logo'] = ['mode' => 'replace', 'find' => $logo['find'], 'replace' => $logo['replace']];
            } else naxxLinkFail(422, 'Preencha a busca e a substituição dos logos.');
        }
        if (count($result) === 1) naxxLinkFail(422, 'Escolha ao menos uma alteração de links ou logos.');
        return $result;
    }
    if ($operation['kind'] !== 'm3u' || !is_array($operation['items'] ?? null) || count($operation['items']) > 100000 || !is_bool($operation['update_source'] ?? null) || !is_bool($operation['update_logo'] ?? null) || (!$operation['update_source'] && !$operation['update_logo'])) naxxLinkFail(422, 'Escolha os campos que serão atualizados pela lista M3U.');
    $items = [];
    foreach ($operation['items'] as $item) {
        if (!is_array($item) || !is_string($item['name'] ?? null) || !is_string($item['url'] ?? null) || !is_string($item['logo'] ?? null) || strlen($item['name']) > 1024 || strlen($item['url']) > 16384 || strlen($item['logo']) > 16384) naxxLinkFail(422, 'A lista M3U contém campos inválidos ou muito longos.');
        $key = naxxLinkNameKey($item['name']);
        if ($key === null) continue;
        if (isset($items[$key])) { $items[$key]['duplicate'] = true; continue; }
        $items[$key] = ['url' => $item['url'], 'logo' => $item['logo'], 'duplicate' => false];
    }
    return ['kind' => 'm3u', 'items' => $items, 'update_source' => $operation['update_source'], 'update_logo' => $operation['update_logo']];
}

function naxxLinkChange(array $row, array $operation, array $nameCounts = []) {
    $sources = naxxLinkSources($row['stream_source']);
    $newSources = $sources;
    $logo = $row['stream_icon'];
    $newLogo = $logo;
    $key = naxxLinkNameKey($row['stream_display_name']);
    if ($key === null) return ['status' => 'invalid', 'reason' => 'Nome do canal inválido para correspondência.'];
    if ($operation['kind'] === 'm3u') {
        if (($nameCounts[$key] ?? 0) > 1 || !empty($operation['items'][$key]['duplicate'])) return ['status' => 'ambiguous', 'reason' => 'Nome repetido na seleção ou na lista M3U.'];
        if (!isset($operation['items'][$key])) return ['status' => 'unmatched', 'reason' => 'Nome não encontrado na lista M3U.'];
        $item = $operation['items'][$key];
        if ($operation['update_source']) {
            $url = naxxLinkUrl($item['url']);
            if ($url === null || $sources === null) return ['status' => 'invalid', 'reason' => 'Link da lista M3U ou fontes atuais inválidos.'];
            if ($newSources) $newSources[0] = $url;
            else $newSources = [$url];
        }
        if ($operation['update_logo'] && trim($item['logo']) !== '') {
            $newLogo = naxxLinkUrl($item['logo'], true);
            if ($newLogo === null) return ['status' => 'invalid', 'reason' => 'Logo da lista M3U inválido.'];
        }
    } else {
        if (isset($operation['source'])) {
            if ($sources === null) return ['status' => 'invalid', 'reason' => 'As fontes atuais não são uma lista válida.'];
            foreach ($sources as $index => $source) {
                $next = str_replace($operation['source']['find'], $operation['source']['replace'], $source);
                if ($next !== $source) {
                    $next = naxxLinkUrl($next);
                    if ($next === null) return ['status' => 'invalid', 'reason' => 'A substituição produziria um link inválido.'];
                    $newSources[$index] = $next;
                }
            }
        }
        if (isset($operation['logo'])) {
            $edit = $operation['logo'];
            if ($edit['mode'] === 'set') $newLogo = $edit['url'];
            else {
                $next = str_replace($edit['find'], $edit['replace'], (string) $logo);
                if ($next !== (string) $logo) {
                    $newLogo = naxxLinkUrl($next, true);
                    if ($newLogo === null) return ['status' => 'invalid', 'reason' => 'A substituição produziria um logo inválido.'];
                }
            }
        }
    }
    $newRaw = $newSources === $sources ? $row['stream_source'] : naxxLinkJson($newSources);
    if ($newRaw === $row['stream_source'] && $newLogo === $logo) return ['status' => 'unchanged'];
    return ['status' => 'changed', 'entry' => ['id' => (string) $row['id'], 'uuid' => $row['uuid'], 'name' => $row['stream_display_name'], 'old_source' => $row['stream_source'], 'old_logo' => $logo, 'new_source' => $newRaw, 'new_logo' => $newLogo], 'sample' => ['id' => (string) $row['id'], 'name' => (string) $row['stream_display_name'], 'old_sources' => $sources === null ? [] : $sources, 'new_sources' => $newSources === null ? [] : $newSources, 'old_logo' => (string) $logo, 'new_logo' => (string) $newLogo]];
}

function naxxLinkCheckPath($path, $directory) {
    clearstatcache(true, $path);
    if (is_link($path) || ($directory ? !is_dir($path) : !is_file($path))) naxxLinkFail(503, 'O armazenamento privado da prévia não está disponível.');
    if (function_exists('posix_geteuid') && fileowner($path) !== posix_geteuid()) naxxLinkFail(503, 'O armazenamento privado da prévia não está disponível.');
    if (DIRECTORY_SEPARATOR !== '\\' && (fileperms($path) & 0777) !== ($directory ? 0700 : 0600)) naxxLinkFail(503, 'O armazenamento privado da prévia não está disponível.');
}

function naxxLinkStorage(array $config) {
    if (!isset($config['dir'], $config['scope'], $config['secret']) || !is_string($config['dir']) || !preg_match('/^[a-f0-9]{64}$/D', $config['scope']) || !preg_match('/^[a-f0-9]{64}$/D', $config['secret'])) naxxLinkFail(503, 'Não foi possível preparar uma prévia privada.');
    $dir = rtrim($config['dir'], '/\\');
    $ancestor = $dir;
    while ($ancestor !== dirname($ancestor)) {
        if (is_link($ancestor)) naxxLinkFail(503, 'O armazenamento privado da prévia não está disponível.');
        $ancestor = dirname($ancestor);
    }
    if (!is_dir($dir)) {
        if (!is_dir(dirname($dir)) || !mkdir($dir, 0700)) naxxLinkFail(503, 'Não foi possível preparar uma prévia privada.');
    }
    naxxLinkCheckPath($dir, true);
    return $dir;
}

function naxxLinkGc($dir, $now = null) {
    // At most 384 directory entries / 128 jobs per preview. Never traverse subdirectories.
    // Age, private ownership and a nonblocking stable metadata lock are all required.
    $cutoff = ($now === null ? time() : $now) - 3600;
    $tokens = [];
    $scanned = 0;
    foreach (new DirectoryIterator($dir) as $entry) {
        if ($entry->isDot()) continue;
        if (++$scanned > 384) break;
        if (!preg_match('/^([a-f0-9]{64})\.(?:plan|meta|lock|meta\.[a-f0-9]{16}\.tmp)$/D', $entry->getFilename(), $match)) continue;
        if (!isset($tokens[$match[1]]) && count($tokens) >= 128) continue;
        $tokens[$match[1]][] = $entry->getPathname();
    }
    foreach ($tokens as $token => $seenPaths) {
        $base = $dir . DIRECTORY_SEPARATOR . $token;
        $lockPath = $base . '.lock';
        $paths = array_values(array_unique(array_merge([$base . '.plan', $base . '.meta', $lockPath], $seenPaths)));
        $safe = function ($path) use ($cutoff) {
            clearstatcache(true, $path);
            if (is_link($path)) return false;
            if (!file_exists($path)) return true;
            return is_file($path) && filemtime($path) <= $cutoff && (!function_exists('posix_geteuid') || fileowner($path) === posix_geteuid()) && (DIRECTORY_SEPARATOR === '\\' || (fileperms($path) & 0777) === 0600);
        };
        $eligible = true;
        foreach ($paths as $path) if (!$safe($path)) { $eligible = false; break; }
        if (!$eligible) continue;
        $createdLock = !file_exists($lockPath);
        $lock = @fopen($lockPath, $createdLock ? 'x+b' : 'r+b');
        if ($lock === false) continue;
        if ($createdLock) chmod($lockPath, 0600);
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); continue; }
        try {
            foreach ($paths as $path) if ($path !== $lockPath && !$safe($path)) { $eligible = false; break; }
            if (!$createdLock && !$safe($lockPath)) $eligible = false;
            if ($eligible) foreach ($paths as $path) if ($path !== $lockPath && is_file($path) && !is_link($path)) @unlink($path);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        if (($eligible || $createdLock) && is_file($lockPath) && !is_link($lockPath)) @unlink($lockPath);
    }
}

function naxxLinkWrite($handle, $data) {
    $offset = 0;
    while ($offset < strlen($data)) {
        $written = fwrite($handle, substr($data, $offset));
        if ($written === false || $written === 0) naxxLinkFail(503, 'Não foi possível salvar a prévia privada.');
        $offset += $written;
    }
}

function naxxLinkSigned($value, $token, $secret) {
    $data = naxxLinkJson($value);
    return naxxLinkJson(['data' => $data, 'mac' => hash_hmac('sha256', $token . "\n" . $data, $secret)]);
}

function naxxLinkVerified($raw, $token, $secret) {
    $wrapper = json_decode($raw, true);
    if (!is_array($wrapper) || !is_string($wrapper['data'] ?? null) || !is_string($wrapper['mac'] ?? null) || !hash_equals(hash_hmac('sha256', $token . "\n" . $wrapper['data'], $secret), $wrapper['mac'])) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.');
    $data = json_decode($wrapper['data'], true);
    if (!is_array($data)) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.');
    return $data;
}

function naxxLinkSaveMeta($handle, array $meta, $token, array $config) {
    $raw = naxxLinkSigned($meta, $token, $config['secret']);
    // A stable metadata lock is held separately: atomically replace the state file only
    // after the complete new state is durable. A failed write leaves the old cursor retryable.
    $path = rtrim($config['dir'], '/\\') . DIRECTORY_SEPARATOR . $token . '.meta';
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    $output = fopen($temporary, 'x+b');
    if ($output === false) naxxLinkFail(503, 'Não foi possível salvar o andamento. Tente retomar a mesma prévia.');
    try {
        chmod($temporary, 0600);
        naxxLinkCheckPath($temporary, false);
        naxxLinkWrite($output, $raw);
        if (!fflush($output)) naxxLinkFail(503, 'Não foi possível salvar o andamento. Tente retomar a mesma prévia.');
        if (function_exists('fsync') && !fsync($output)) naxxLinkFail(503, 'Não foi possível salvar o andamento. Tente retomar a mesma prévia.');
        fclose($output);
        $output = null;
        if (!rename($temporary, $path)) naxxLinkFail(503, 'Não foi possível salvar o andamento. Tente retomar a mesma prévia.');
    } finally {
        if (is_resource($output)) fclose($output);
        if (is_file($temporary) && !is_link($temporary)) unlink($temporary);
    }
}

function naxxLinkPreview($db, array $ids, array $operation, array $config, $table = 'streams') {
    $catalog = naxxLinkCatalog($db, $ids, $table);
    $counts = [];
    $names = [];
    foreach ($catalog as $channel) {
        $names[$channel['id']] = $channel['name'];
        if ($channel['match_key'] !== null) $counts[$channel['match_key']] = ($counts[$channel['match_key']] ?? 0) + 1;
    }
    unset($catalog);
    $dir = naxxLinkStorage($config);
    naxxLinkGc($dir);
    $token = bin2hex(random_bytes(32));
    $planPath = $dir . DIRECTORY_SEPARATOR . $token . '.plan';
    $metaPath = $dir . DIRECTORY_SEPARATOR . $token . '.meta';
    $lockPath = $dir . DIRECTORY_SEPARATOR . $token . '.lock';
    $plan = fopen($planPath, 'x+b');
    if ($plan === false) naxxLinkFail(503, 'Não foi possível salvar a prévia privada.');
    chmod($planPath, 0600);
    $metaHandle = null;
    $complete = false;
    try {
        naxxLinkCheckPath($planPath, false);
        $summary = ['selected' => count($ids), 'changed' => 0, 'unchanged' => 0, 'unmatched' => 0, 'ambiguous' => 0, 'invalid' => 0];
        $samples = [];
        $issues = [];
        $bytes = 0;
        $seen = 0;
        naxxLinkRead($db, $ids, $table, true, function ($row) use (&$seen, &$summary, &$samples, &$issues, &$bytes, $operation, $counts, $names, $plan, $token, $config) {
            if (!isset($names[(string) $row['id']]) || $row['stream_display_name'] !== $names[(string) $row['id']]) naxxLinkFail(409, 'Um nome de canal mudou durante a prévia. Atualize a lista e tente novamente.');
            ++$seen;
            $change = naxxLinkChange($row, $operation, $counts);
            ++$summary[$change['status']];
            if ($change['status'] !== 'changed') {
                if (isset($change['reason']) && count($issues) < 100) $issues[] = ['id' => (string) $row['id'], 'name' => (string) $row['stream_display_name'], 'reason' => $change['reason']];
                return;
            }
            $line = naxxLinkSigned($change['entry'], $token, $config['secret']) . "\n";
            if (strlen($line) > 4194304) naxxLinkFail(413, 'Um canal ultrapassa o limite de dados da prévia. Reduza as fontes desse canal antes de editar em massa.');
            $bytes += strlen($line);
            if ($bytes > 33554432) naxxLinkFail(413, 'A prévia ultrapassa 32 MiB. Reduza a seleção e tente novamente.');
            naxxLinkWrite($plan, $line);
            if (count($samples) < 100) $samples[] = $change['sample'];
        });
        if ($seen !== count($ids)) naxxLinkFail(409, 'A seleção mudou durante a prévia. Atualize a lista e tente novamente.');
        if (!fflush($plan)) naxxLinkFail(503, 'Não foi possível salvar a prévia privada.');
        fclose($plan);
        $plan = null;
        $expires = time() + 1800;
        if ($summary['changed']) {
            $metaHandle = fopen($lockPath, 'x+b');
            if ($metaHandle === false) naxxLinkFail(503, 'Não foi possível salvar a prévia privada.');
            chmod($lockPath, 0600);
            naxxLinkCheckPath($lockPath, false);
            if (!flock($metaHandle, LOCK_EX)) naxxLinkFail(503, 'Não foi possível salvar a prévia privada.');
            $meta = ['version' => 1, 'scope' => $config['scope'], 'created' => time(), 'expires' => $expires, 'total' => $summary['changed'], 'bytes' => $bytes, 'cursor' => 0, 'offset' => 0, 'previous_cursor' => null, 'last_response' => null];
            naxxLinkSaveMeta($metaHandle, $meta, $token, $config);
            fclose($metaHandle);
            $metaHandle = null;
        } else {
            unlink($planPath);
            $token = null;
        }
        $complete = true;
        return ['ok' => true, 'token' => $token, 'expires_at' => $expires, 'summary' => $summary, 'changes' => $samples, 'truncated' => $summary['changed'] > count($samples), 'issues' => $issues, 'issues_truncated' => ($summary['unmatched'] + $summary['ambiguous'] + $summary['invalid']) > count($issues)];
    } finally {
        if (is_resource($plan)) fclose($plan);
        if (is_resource($metaHandle)) fclose($metaHandle);
        if (!$complete) {
            if (is_file($planPath) && !is_link($planPath)) unlink($planPath);
            if (is_file($metaPath) && !is_link($metaPath)) unlink($metaPath);
            if (is_file($lockPath) && !is_link($lockPath)) unlink($lockPath);
        }
    }
}

function naxxLinkOpenMeta($token, array $config) {
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) naxxLinkFail(422, 'A identificação da prévia está inválida.');
    $dir = naxxLinkStorage($config);
    $path = $dir . DIRECTORY_SEPARATOR . $token . '.meta';
    if (!file_exists($path)) naxxLinkFail(410, 'A prévia expirou ou foi descartada. Gere uma nova prévia.');
    naxxLinkCheckPath($path, false);
    $lockPath = $dir . DIRECTORY_SEPARATOR . $token . '.lock';
    naxxLinkCheckPath($lockPath, false);
    $handle = fopen($lockPath, 'r+b');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        naxxLinkFail(503, 'Não foi possível abrir a prévia. Tente novamente.');
    }
    try {
        // Read only after locking; another request may have atomically advanced the file.
        naxxLinkCheckPath($path, false);
        $raw = file_get_contents($path, false, null, 0, 32769);
        if ($raw === false || strlen($raw) > 32768) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.');
        $meta = naxxLinkVerified($raw, $token, $config['secret']);
        if (($meta['version'] ?? null) !== 1 || ($meta['scope'] ?? null) !== $config['scope']) naxxLinkFail(403, 'Esta prévia pertence a outra sessão.');
        foreach (['created', 'expires', 'total', 'bytes', 'cursor', 'offset'] as $field) if (!isset($meta[$field]) || !is_int($meta[$field]) || $meta[$field] < 0) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.');
        if ($meta['expires'] <= time()) naxxLinkFail(410, 'A prévia expirou. Gere uma nova prévia.');
        if ($meta['expires'] - $meta['created'] !== 1800 || $meta['created'] > time() + 30 || $meta['total'] > 50000 || $meta['total'] < 1 || $meta['bytes'] > 33554432 || $meta['cursor'] > $meta['total'] || $meta['offset'] > $meta['bytes']) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.');
        return [$handle, $meta, $dir];
    } catch (Throwable $error) {
        flock($handle, LOCK_UN);
        fclose($handle);
        throw $error;
    }
}

function naxxLinkEntryValid(array $entry) {
    if (!isset($entry['id']) || !is_string($entry['id']) || !preg_match('/^[1-9][0-9]{0,9}$/D', $entry['id'])) return false;
    foreach (['uuid', 'name', 'old_source', 'old_logo', 'new_source', 'new_logo'] as $field) if (!array_key_exists($field, $entry) || (!is_string($entry[$field]) && $entry[$field] !== null)) return false;
    return true;
}

function naxxLinkApply($db, $token, $cursor, array $config, $table = 'streams') {
    if (!is_int($cursor) || $cursor < 0 || $cursor > 50000) naxxLinkFail(422, 'O andamento da prévia está inválido.');
    list($handle, $meta, $dir) = naxxLinkOpenMeta($token, $config);
    $plan = null;
    $committed = false;
    $batch = [];
    try {
        if ($meta['previous_cursor'] === $cursor && is_array($meta['last_response'])) return $meta['last_response'];
        if ($cursor !== $meta['cursor']) naxxLinkFail(409, 'O andamento mudou. Retome a prévia pelo último lote confirmado.', ['applied' => $meta['cursor']]);
        if ($cursor === $meta['total']) return ['ok' => true, 'applied' => $cursor, 'total' => $meta['total'], 'next_cursor' => $cursor, 'done' => true, 'cache_pending' => true];
        $path = $dir . DIRECTORY_SEPARATOR . $token . '.plan';
        naxxLinkCheckPath($path, false);
        if (filesize($path) !== $meta['bytes']) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.', ['applied' => $cursor]);
        $plan = fopen($path, 'rb');
        if ($plan === false || fseek($plan, $meta['offset']) !== 0) naxxLinkFail(409, 'Não foi possível ler a prévia. Gere uma nova prévia.', ['applied' => $cursor]);
        $count = min(250, $meta['total'] - $cursor);
        for ($index = 0; $index < $count; ++$index) {
            $line = fgets($plan, 4194305);
            if ($line === false || substr($line, -1) !== "\n") naxxLinkFail(409, 'A prévia está incompleta. Gere uma nova prévia.', ['applied' => $cursor]);
            $entry = naxxLinkVerified($line, $token, $config['secret']);
            if (!naxxLinkEntryValid($entry) || isset($batch[$entry['id']])) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.', ['applied' => $cursor]);
            $batch[$entry['id']] = $entry;
        }
        $offset = ftell($plan);
        if ($offset === false || ($cursor + $count === $meta['total'] && $offset !== $meta['bytes'])) naxxLinkFail(409, 'A prévia está inválida. Gere uma nova prévia.', ['applied' => $cursor]);
        fclose($plan);
        $plan = null;
        $db->beginTransaction();
        try {
            $rows = [];
            naxxLinkRead($db, array_keys($batch), $table, true, function ($row) use (&$rows) { $rows[(string) $row['id']] = $row; }, true);
            foreach ($batch as $id => $entry) {
                $row = $rows[$id] ?? null;
                if (!$row || $row['uuid'] !== $entry['uuid'] || $row['stream_display_name'] !== $entry['name']) naxxLinkFail(409, 'Um canal foi removido ou alterado após a prévia. O lote atual foi cancelado; gere uma nova prévia.', ['applied' => $cursor]);
                $old = $row['stream_source'] === $entry['old_source'] && $row['stream_icon'] === $entry['old_logo'];
                $desired = $row['stream_source'] === $entry['new_source'] && $row['stream_icon'] === $entry['new_logo'];
                if (!$old && !$desired) naxxLinkFail(409, 'Links ou logos mudaram após a prévia. O lote atual foi cancelado; gere uma nova prévia.', ['applied' => $cursor]);
            }
            foreach ($batch as $id => $entry) {
                $row = $rows[$id];
                $set = [];
                $values = [];
                if ($row['stream_source'] !== $entry['new_source']) { $set[] = 'stream_source = ?'; $values[] = $entry['new_source']; }
                if ($row['stream_icon'] !== $entry['new_logo']) { $set[] = 'stream_icon = ?'; $values[] = $entry['new_logo']; }
                if (!$set) continue;
                $set[] = 'updated = CURRENT_TIMESTAMP';
                $values[] = (string) $id;
                $query = $db->prepare('UPDATE ' . naxxLinkTable($table) . ' SET ' . implode(', ', $set) . ' WHERE type = 1 AND id = ?');
                $query->execute($values);
                if ($query->rowCount() !== 1) naxxLinkFail(409, 'Um canal mudou durante a aplicação. O lote atual foi cancelado.', ['applied' => $cursor]);
            }
            $db->commit();
            $committed = true;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $next = $cursor + $count;
        $response = ['ok' => true, 'applied' => $next, 'total' => $meta['total'], 'next_cursor' => $next, 'done' => $next === $meta['total'], 'cache_pending' => true];
        $meta['previous_cursor'] = $cursor;
        $meta['cursor'] = $next;
        $meta['offset'] = $offset;
        $meta['last_response'] = $response;
        naxxLinkSaveMeta($handle, $meta, $token, $config);
        return $response;
    } catch (Throwable $error) {
        if ($committed) naxxLinkFail(503, 'O lote foi salvo, mas o andamento não pôde ser confirmado. Retome a mesma prévia para confirmar sem repetir alterações.', ['applied' => $cursor + count($batch)]);
        throw $error;
    } finally {
        if (is_resource($plan)) fclose($plan);
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function naxxLinkDiscard($token, array $config) {
    list($handle, $meta, $dir) = naxxLinkOpenMeta($token, $config);
    try {
        $path = $dir . DIRECTORY_SEPARATOR . $token . '.plan';
        if (file_exists($path)) {
            naxxLinkCheckPath($path, false);
            if (!unlink($path)) naxxLinkFail(503, 'Não foi possível descartar a prévia.');
        }
        // Invalidate under the stable lock before removing the metadata file.
        $meta['expires'] = 0;
        naxxLinkSaveMeta($handle, $meta, $token, $config);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    $path = $dir . DIRECTORY_SEPARATOR . $token . '.meta';
    if (is_file($path) && !is_link($path)) unlink($path);
    $path = $dir . DIRECTORY_SEPARATOR . $token . '.lock';
    if (is_file($path) && !is_link($path)) unlink($path);
    return ['ok' => true];
}


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

}

if (($_GET['feature'] ?? '') === 'public-page') {

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

}

if (($_GET['feature'] ?? '') === 'ondemand') {

// Política pura: não consulta fontes, banco, cache ou processos do painel.

/** Compatível com PHP 7.4: verifica uma lista com índices consecutivos. */
function naxxOdIsList(array $value) {
    return !$value || array_keys($value) === range(0, count($value) - 1);
}

/** Valida uma lista ou JSON de fontes, preservando URLs, ordem e duplicatas. */
function naxxOdNormalizeSources($input) {
    if (is_string($input)) {
        $json = trim($input);
        $input = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE || substr($json, 0, 1) !== '[') {
            return ['sources' => [], 'valid' => false, 'reason' => 'A lista de fontes não contém um JSON de lista válido.'];
        }
    }
    if (!is_array($input) || !naxxOdIsList($input) || !$input) {
        return ['sources' => [], 'valid' => false, 'reason' => 'Informe ao menos uma fonte em uma lista válida.'];
    }
    $sources = [];
    foreach ($input as $index => $source) {
        $label = 'A fonte ' . ($index + 1);
        if (!is_string($source) || trim($source) === '') {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' está vazia ou não é um endereço de texto.'];
        }
        $source = trim($source);
        if (preg_match('/[\x00-\x20\x7f]/', $source)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' contém espaços ou caracteres de controle.'];
        }
        $parts = parse_url($source);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' não tem protocolo e servidor válidos.'];
        }
        if (!in_array(strtolower($parts['scheme']), ['http', 'https', 'rtsp', 'udp'], true)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' usa protocolo não permitido. Use HTTP, HTTPS, RTSP ou UDP.'];
        }
        $host = $parts['host'];
        if (strpos($host, '[') !== false || strpos($host, ']') !== false) {
            $validHost = substr($host, 0, 1) === '[' && substr($host, -1) === ']'
                && filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
        } else {
            $validHost = filter_var($host, FILTER_VALIDATE_IP) !== false
                || filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
        }
        if (!$validHost) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' não tem um nome de servidor ou endereço IP válido.'];
        }
        if (isset($parts['port']) && ($parts['port'] < 1 || $parts['port'] > 65535)) {
            return ['sources' => [], 'valid' => false, 'reason' => $label . ' usa uma porta inválida.'];
        }
        $sources[] = $source;
    }
    return ['sources' => $sources, 'valid' => true, 'reason' => 'Lista de fontes válida; os endereços não foram acessados.'];
}

/** Ordena mapas recursivamente, mantendo listas e tipos para uma assinatura estável. */
function naxxOdCanonicalValue($value) {
    if (is_array($value)) {
        if (!naxxOdIsList($value)) ksort($value, SORT_STRING);
        foreach ($value as $key => $item) $value[$key] = naxxOdCanonicalValue($item);
        return $value;
    }
    if (is_scalar($value) || $value === null) return $value;
    throw new InvalidArgumentException('Os parâmetros da assinatura devem conter apenas arrays e valores escalares.');
}

/** SHA-256 das strings exatas e flags fornecidos; não devolve nem registra fontes. */
function naxxOdFingerprint(array $sources, array $flags = []) {
    if (!naxxOdIsList($sources)) throw new InvalidArgumentException('As fontes da assinatura devem formar uma lista.');
    foreach ($sources as $source) {
        if (!is_string($source)) throw new InvalidArgumentException('As fontes da assinatura devem ser textos.');
    }
    $json = json_encode(['sources' => $sources, 'flags' => naxxOdCanonicalValue($flags)],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($json === false) throw new InvalidArgumentException('Não foi possível serializar os parâmetros da assinatura.');
    return hash('sha256', $json);
}

/** Interpreta valores usuais de formulários; valores não vazios desconhecidos são ativos. */
function naxxOdFlagEnabled($value) {
    if ($value === null || $value === false) return false;
    if (is_string($value)) {
        $value = trim($value);
        if (in_array(strtolower($value), ['', 'false', 'off', 'no'], true)) return false;
        if (is_numeric($value)) return (float) $value != 0;
        return true;
    }
    if (is_int($value) || is_float($value)) return $value != 0;
    if (is_array($value)) return count($value) > 0;
    return (bool) $value;
}

/** Classifica o resultado real de ffprobe, sem usar a extensão da URL. */
function naxxOdClassifyObservation($observation) {
    $result = ['format' => null, 'verified' => false, 'reason' => '', 'video_codecs' => [], 'audio_codecs' => []];
    if (is_string($observation)) {
        $json = trim($observation);
        $observation = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE || substr($json, 0, 1) !== '{') {
            $result['reason'] = 'A análise da fonte não contém um JSON de objeto válido.';
            return $result;
        }
    }
    if (!is_array($observation)) {
        $result['reason'] = 'A análise da fonte está ausente ou incompleta.';
        return $result;
    }
    if (naxxOdFlagEnabled($observation['timeout'] ?? false) || naxxOdFlagEnabled($observation['timed_out'] ?? false)) {
        $result['reason'] = 'A análise da fonte excedeu o tempo de espera.';
        return $result;
    }
    if (!empty($observation['error']) || (array_key_exists('ok', $observation) && $observation['ok'] !== true)
        || (isset($observation['exit_code']) && $observation['exit_code'] !== 0)) {
        $result['reason'] = 'A análise da fonte terminou com erro.';
        return $result;
    }
    $name = $observation['format']['format_name'] ?? null;
    if (!is_string($name) || trim($name) === '') {
        $result['reason'] = 'O formato real da fonte não foi identificado.';
        return $result;
    }
    $families = [
        'mpegts' => ['mpegts'], 'hls' => ['hls', 'applehttp'],
        'mp4' => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
        'matroska' => ['matroska', 'webm'], 'flv' => ['flv'], 'avi' => ['avi'],
        'mpeg' => ['mpeg'], 'ogg' => ['ogg'], 'rtsp' => ['rtsp'], 'rtp' => ['rtp'], 'sdp' => ['sdp']
    ];
    $found = [];
    foreach (explode(',', strtolower($name)) as $alias) {
        $alias = trim($alias);
        $family = null;
        foreach ($families as $candidate => $aliases) {
            if (in_array($alias, $aliases, true)) { $family = $candidate; break; }
        }
        if ($family === null) {
            $result['reason'] = 'A análise retornou um formato desconhecido para esta política.';
            return $result;
        }
        $found[$family] = true;
    }
    if (count($found) !== 1) {
        $result['reason'] = 'A análise retornou formatos incompatíveis entre si.';
        return $result;
    }
    $result['format'] = key($found);
    if (!isset($observation['streams']) || !is_array($observation['streams']) || !naxxOdIsList($observation['streams'])) {
        $result['reason'] = 'A análise não identificou os codecs de vídeo e áudio.';
        return $result;
    }
    foreach ($observation['streams'] as $stream) {
        if (!is_array($stream)) {
            $result['reason'] = 'A análise contém informações de mídia incompletas.';
            return $result;
        }
        $type = $stream['codec_type'] ?? null;
        if ($type !== 'video' && $type !== 'audio') continue;
        $codec = $stream['codec_name'] ?? null;
        if (!is_string($codec) || !preg_match('/^[a-z0-9_]+$/i', $codec) || in_array(strtolower($codec), ['unknown', 'none', 'n_a'], true)) {
            $result['reason'] = 'A análise contém um codec de vídeo ou áudio desconhecido.';
            return $result;
        }
        $key = $type === 'video' ? 'video_codecs' : 'audio_codecs';
        $result[$key][] = strtolower($codec);
    }
    if (!$result['video_codecs'] || !$result['audio_codecs']) {
        $result['reason'] = 'A análise precisa identificar ao menos um codec de vídeo e um de áudio.';
        return $result;
    }
    $result['video_codecs'] = array_values(array_unique($result['video_codecs']));
    $result['audio_codecs'] = array_values(array_unique($result['audio_codecs']));
    $result['verified'] = true;
    $result['reason'] = 'Formato e codecs de vídeo e áudio identificados pela análise.';
    return $result;
}

/** Capacidades: lista de modos ou mapa modes/video_codecs/audio_codecs por formato. */
function naxxOdDecide(array $sources, array $observations, array $flags = [], array $capabilities = [], array $preference = [2, 1, 0]) {
    $result = ['mode' => 0, 'reason' => '', 'format' => null, 'verified' => false];
    $normalized = naxxOdNormalizeSources($sources);
    if (!$normalized['valid']) { $result['reason'] = $normalized['reason']; return $result; }
    $incompatible = [
        'direct_source' => 'fonte direta', 'transcode' => 'transcodificação', 'transcode_profile_id' => 'perfil de transcodificação',
        'custom_ffmpeg' => 'comando FFmpeg personalizado', 'delay' => 'atraso configurado', 'delay_minutes' => 'atraso configurado'
    ];
    foreach ($incompatible as $key => $label) {
        if (naxxOdFlagEnabled($flags[$key] ?? null)) {
            $result['reason'] = 'Mantido o modo convencional: ' . $label . ' é incompatível com a seleção automática.';
            return $result;
        }
    }
    if (!naxxOdIsList($observations) || count($observations) !== count($normalized['sources'])) {
        $result['reason'] = 'Falta uma análise completa para cada fonte, incluindo as reservas.';
        return $result;
    }
    $formats = []; $videoCodecs = []; $audioCodecs = [];
    foreach ($observations as $index => $observation) {
        $classified = naxxOdClassifyObservation($observation);
        if (!$classified['verified']) {
            $result['reason'] = 'Fonte ' . ($index + 1) . ': ' . $classified['reason'];
            return $result;
        }
        $formats[$classified['format']] = true;
        $videoCodecs = array_merge($videoCodecs, $classified['video_codecs']);
        $audioCodecs = array_merge($audioCodecs, $classified['audio_codecs']);
    }
    if (count($formats) !== 1) {
        $result['reason'] = 'As fontes principal e reservas usam formatos diferentes; mantido o modo convencional.';
        return $result;
    }
    $result['format'] = key($formats);
    $capability = $capabilities[$result['format']] ?? null;
    $modes = $capability;
    if (is_array($capability) && !naxxOdIsList($capability)) {
        $modes = $capability['modes'] ?? null;
        foreach (['video_codecs' => $videoCodecs, 'audio_codecs' => $audioCodecs] as $key => $observed) {
            $whitelist = $capability[$key] ?? null;
            if (!is_array($whitelist) || !$whitelist || !naxxOdIsList($whitelist)) {
                $result['reason'] = 'A lista de codecs validados está incompleta; mantido o modo convencional.';
                return $result;
            }
            $allowed = [];
            foreach ($whitelist as $codec) {
                if (!is_string($codec) || !preg_match('/^[a-z0-9_]+$/i', $codec) || in_array(strtolower($codec), ['unknown', 'none', 'n_a'], true)) {
                    $result['reason'] = 'A lista de codecs validados é inválida; mantido o modo convencional.';
                    return $result;
                }
                $allowed[] = strtolower($codec);
            }
            if (array_diff($observed, $allowed)) {
                $result['reason'] = 'Há codecs de vídeo ou áudio sem validação em uma das fontes; mantido o modo convencional.';
                return $result;
            }
        }
    }
    if (!is_array($modes) || !$modes || !naxxOdIsList($modes)) {
        $result['reason'] = 'Não há modos validados para o formato identificado; mantido o modo convencional.';
        return $result;
    }
    foreach ([$modes, $preference] as $list) {
        if (!$list || !naxxOdIsList($list)) {
            $result['reason'] = 'A configuração de capacidades ou preferência é inválida; mantido o modo convencional.';
            return $result;
        }
        foreach ($list as $mode) {
            if (!is_int($mode) || !in_array($mode, [0, 1, 2], true)) {
                $result['reason'] = 'A configuração contém um modo não suportado; mantido o modo convencional.';
                return $result;
            }
        }
    }
    foreach ($preference as $mode) {
        if (!in_array($mode, $modes, true)) continue;
        $result['mode'] = $mode;
        $result['verified'] = true;
        $result['reason'] = $mode === 0
            ? 'Todas as fontes foram analisadas; o modo convencional foi selecionado conforme as capacidades validadas.'
            : 'Todas as fontes têm o mesmo formato e codecs identificados; selecionado o modo nativo ' . $mode . ' entre as capacidades validadas.';
        return $result;
    }
    $result['reason'] = 'Nenhum modo validado coincide com a preferência informada; mantido o modo convencional.';
    return $result;
}


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

}

if (($_GET['feature'] ?? '') === 'cache') {

// Diagnóstico somente de leitura. Executado pelo endpoint administrativo já instalado.
ini_set('display_errors','0');set_time_limit(12);
$naxxCacheDone=false;
function naxxCacheReply($code,$value){
 $GLOBALS['naxxCacheDone']=true;while(ob_get_level())ob_end_clean();
 if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
 header_remove('Location');header_remove('Content-Length');http_response_code($code);
 header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
 echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
register_shutdown_function(function(){if(empty($GLOBALS['naxxCacheDone']))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);});
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET'){header('Allow: GET');naxxCacheReply(405,['ok'=>false,'message'=>'O diagnóstico aceita somente consultas.']);}
$_GET=$_POST=$_REQUEST=[];
$naxxCacheHtml='';
ob_start(function($chunk)use(&$naxxCacheHtml){if(strlen($naxxCacheHtml)<2*1024*1024)$naxxCacheHtml.=$chunk;return '';},8192);
require __DIR__.'/cache.php';ob_end_flush();
$redirect=false;foreach(headers_list()as$line)if(stripos($line,'Location:')===0)$redirect=true;
if($redirect||http_response_code()>=300||!preg_match('/\bid\s*=\s*[\x22\x27](?:cache_thread_count|enable_cache|disable_cache|enable_handler|disable_handler)[\x22\x27]/',$naxxCacheHtml))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);
if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
$document=new DOMDocument();$previous=libxml_use_internal_errors(true);$document->loadHTML($naxxCacheHtml,LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);libxml_clear_errors();libxml_use_internal_errors($previous);
$cache=['enabled'=>(bool)$document->getElementById('disable_cache'),'handler_enabled'=>(bool)$document->getElementById('disable_handler'),'last_run'=>null,'counts'=>[]];
if(preg_match('/Your last cron execution was at\s*(?:<strong>)?([0-9-]+\s+[0-9:]+)/',$naxxCacheHtml,$date))$cache['last_run']=$date[1];
$table=$document->getElementById('datatable-cache');if($table)foreach($table->getElementsByTagName('button')as$button)$cache['counts'][]=trim($button->textContent);
$nativeRedis=$document->getElementById('datatable-redis');$cache['native_redis_warning']=$nativeRedis?(bool)preg_match('/OFFLINE|INVALID PASSWORD/i',$nativeRedis->textContent):false;
$redis=['status'=>'unavailable','message'=>'A extensão Redis não está disponível neste servidor.'];$client=null;
if(class_exists('Redis')){
 $connected=false;
 try{
  $config=@file_get_contents(dirname(__DIR__).'/bin/redis/redis.conf',false,null,0,1024*1024);
  if($config===false)throw new RuntimeException('configuration');
  $port=6379;if(preg_match('/^\s*port\s+(\d+)\s*$/m',$config,$match))$port=(int)$match[1];
  if($port<1||$port>65535)throw new RuntimeException('configuration');
  $password='';if(preg_match('/^\s*requirepass\s+(.+?)\s*$/m',$config,$match)){
   $value=trim($match[1]);
   if($value[0]==='"'&&substr($value,-1)==='"')$password=stripcslashes(substr($value,1,-1));
   elseif($value[0]==="'"&&substr($value,-1)==="'")$password=substr($value,1,-1);
   else{$parts=preg_split('/\s+/', $value);$password=$parts[0];}
  }
  $client=new Redis();$start=microtime(true);$connected=$client->connect('127.0.0.1',$port,0.8);
  if(!$connected)throw new RuntimeException('connection');$client->setOption(Redis::OPT_READ_TIMEOUT,1.0);
  if($password!==''&&!$client->auth($password))throw new RuntimeException('authentication');
  $client->ping();$latency=round((microtime(true)-$start)*1000,2);
  $memory=$client->info('memory');$stats=$client->info('stats');$clients=$client->info('clients');$server=$client->info('server');$keyspace=$client->info('keyspace');
  $keys=0;foreach($keyspace as$db=>$value){if(!preg_match('/^db\d+$/',$db))continue;if(is_array($value))$keys+=(int)($value['keys']??0);elseif(preg_match('/(?:^|,)keys=(\d+)/',$value,$match))$keys+=(int)$match[1];}
  $hits=(int)($stats['keyspace_hits']??0);$misses=(int)($stats['keyspace_misses']??0);
  $redis=['status'=>'online','message'=>'Redis respondeu ao diagnóstico local.','latency_ms'=>$latency,'used_memory'=>(int)($memory['used_memory']??0),'peak_memory'=>(int)($memory['used_memory_peak']??0),'max_memory'=>(int)($memory['maxmemory']??0),'clients'=>(int)($clients['connected_clients']??0),'keys'=>$keys,'hits'=>$hits,'misses'=>$misses,'hit_rate'=>$hits+$misses?round($hits/($hits+$misses)*100,1):null,'evictions'=>(int)($stats['evicted_keys']??0),'operations_per_second'=>(int)($stats['instantaneous_ops_per_sec']??0),'uptime_seconds'=>(int)($server['uptime_in_seconds']??0)];
 }catch(Throwable$error){$redis=['status'=>$connected?'authentication_error':'offline','message'=>$connected?'Não foi possível autenticar ou consultar o Redis com a configuração local.':'Não foi possível consultar o Redis local. Confira o serviço e sua configuração.'];}
 finally{if($client){try{$client->close();}catch(Throwable$error){}}}
}
naxxCacheReply(200,['ok'=>true,'checked_at'=>date('c'),'cache'=>$cache,'redis'=>$redis]);

}

if (($_GET['feature'] ?? '') === 'stream-sources') {

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

}

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
if (isset($response['state']) && is_array($response['state'])) {
    $response['state']['interfaceVersion'] = '1.15';
}
if (empty($response['ok'])) {
    $status = isset($response['status']) && in_array((int) $response['status'], array(400, 403, 409, 500, 502, 503), true) ? (int) $response['status'] : 500;
    unset($response['status']);
    naxxUpdateReply($status, $response);
}
naxxUpdateReply(in_array($action, array('check', 'install', 'rollback'), true) ? 202 : 200, $response);
