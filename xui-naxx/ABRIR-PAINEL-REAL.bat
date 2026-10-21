@echo off
setlocal
cd /d "%~dp0"
title XUI NAXX - Abrir painel da VM
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0vm\iniciar_vm.py"
) else (
    python "%~dp0vm\iniciar_vm.py"
)
if errorlevel 1 pause
endlocal
