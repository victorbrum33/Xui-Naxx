@echo off
setlocal
cd /d "%~dp0"
title PAINEL NAXX - Preparar pacote completo
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0scripts\instalar.py" --prepare-only %*
) else (
    python "%~dp0scripts\instalar.py" --prepare-only %*
)
if errorlevel 1 pause
endlocal
