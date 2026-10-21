@echo off
setlocal
cd /d "%~dp0"
title XUI NAXX - Criar VM Linux
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0vm\criar_vm.py" %*
) else (
    python "%~dp0vm\criar_vm.py" %*
)
pause
endlocal
