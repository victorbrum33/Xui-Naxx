<?php
// A página nativa mantém a autenticação, as permissões e a navegação do painel.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    exit('Abra a página Atualização pelo menu do perfil.');
}
require __DIR__ . '/settings.php';
$naxxUpdateCss = substr(@hash_file('sha256', __DIR__ . '/assets/css/naxx-update.css') ?: '1.5.14', 0, 12);
$naxxUpdateJs = substr(@hash_file('sha256', __DIR__ . '/assets/js/naxx-update-ui.js') ?: '1.5.14', 0, 12);
?>
<link rel="stylesheet" href="assets/css/naxx-update.css?v=<?php echo htmlspecialchars($naxxUpdateCss, ENT_QUOTES, 'UTF-8'); ?>">
<script src="assets/js/naxx-update-ui.js?v=<?php echo htmlspecialchars($naxxUpdateJs, ENT_QUOTES, 'UTF-8'); ?>"></script>
