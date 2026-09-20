@echo off
REM Arranca Asistencia QR y abre el navegador.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1" %*
