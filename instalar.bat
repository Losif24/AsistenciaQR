@echo off
REM Asistencia QR - doble clic para instalar todo.
REM Pide permisos de administrador porque puede necesitar instalar Node.js.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo   Se necesitan permisos de administrador para instalar Node.js.
    echo   Aceptando el aviso de Windows...
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\instalar.ps1" %*
