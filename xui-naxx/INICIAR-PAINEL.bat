@echo off
setlocal
title XUI NAXX - Painel local de teste
cd /d "%~dp0"
echo.
echo   XUI NAXX - Painel local de teste
echo   Dados simulados. Nenhuma conexao com o servidor XUI.
echo.
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0servidor_local.py"
    goto fim
)
where python >nul 2>nul
if not errorlevel 1 (
    python "%~dp0servidor_local.py"
    goto fim
)
echo Python 3 nao encontrado. Instale o Python 3 e marque Add Python to PATH.
:fim
echo.
echo O servidor foi encerrado. Voce pode fechar esta janela.
pause
endlocal
