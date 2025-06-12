:: installer.bat
@echo off
echo Installing MSE-Sync...

echo Installing Bun...
powershell -c "irm bun.sh/install.ps1 | iex"

:: Install dependencies
echo Installing dependencies...
bun i


:: Create startup shortcut
echo Creating startup shortcut...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\MSE-Sync.lnk'); $Shortcut.TargetPath = 'node.exe'; $Shortcut.Arguments = 'index.js start'; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.Save()"

echo Installation complete!
echo MSE-Sync will start automatically with Windows.
echo You can also start it manually by running: npm start
pause