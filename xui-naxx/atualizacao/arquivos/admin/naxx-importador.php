<?php
// Uma abertura por link de atualização renova os assets, preservando a sessão.
if (isset($_GET['v'])) header('Clear-Site-Data: "cache"');
// Usa o carregamento e as permissões do formulário nativo de importação.
$_GET['import'] = '1';
require __DIR__ . '/stream.php';
?>
<link rel="stylesheet" href="assets/css/naxx-importer.css?v=eb3631c5daa8">
<script src="assets/js/naxx-importer.js?v=e574af9367c3"></script>
<script src="assets/js/naxx-importer-ui.js?v=7127ad911c42"></script>
<script src="assets/js/naxx-native-importer.js?v=9b6fb0052fe2"></script>
