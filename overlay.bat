@echo off
title CD Overlay
cd /d "%~dp0"
python -m overlay.main
pause
