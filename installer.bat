:: installer.bat
@echo off
echo Installing MSE-Sync...

echo Installing Bun...
powershell -c "irm bun.sh/install.ps1 | iex"

:: Install dependencies
echo Installing dependencies...
bun i