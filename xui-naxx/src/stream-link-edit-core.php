<?php
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
