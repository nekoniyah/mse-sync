@echo off
powershell -c "irm bun.sh/install.ps1 | iex"
bun install
bun pm untrusted
bun pm trust --all

pause