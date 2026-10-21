<?php
// Uma abertura por link de atualização renova os assets, preservando a sessão.
if (isset($_GET['v'])) header('Clear-Site-Data: "cache"');
// Usa o carregamento e as permissões do formulário nativo de importação.
$_GET['import'] = '1';
require __DIR__ . '/stream.php';
?>
<link rel="stylesheet" href="assets/css/naxx-importer.css?v=1.5.14-4">
<script src="assets/js/naxx-importer.js?v=1.5.14-4"></script>
<script src="assets/js/naxx-importer-ui.js?v=1.5.14-4"></script>
<script src="assets/js/naxx-native-importer.js?v=1.5.14-4"></script>
