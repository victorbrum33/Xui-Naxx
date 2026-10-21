@echo off
setlocal
cd /d "%~dp0"
title XUI NAXX - Instalacao completa na VM
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0vm\instalar_na_vm.py" %*
) else (
    python "%~dp0vm\instalar_na_vm.py" %*
)
pause
endlocal
