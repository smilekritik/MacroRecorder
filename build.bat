@echo off
rem Builds Macro Recorder from a clean checkout. Requires Node 24, Corepack, Rust MSVC, C++ Build Tools and 7-Zip x64.
rem   build.bat         install dependencies, build, package and check the package
rem   build.bat --full  the same, plus type checks, lint, unit, compatibility and Rust tests (no UI tests)
setlocal
pushd "%~dp0"

call corepack pnpm install --frozen-lockfile
if errorlevel 1 goto :failed

if /i "%~1"=="--full" goto :full
call corepack pnpm run build
if errorlevel 1 goto :failed
call corepack pnpm run package
if errorlevel 1 goto :failed
call corepack pnpm run verify:package
if errorlevel 1 goto :failed
goto :done

:full
call corepack pnpm run release
if errorlevel 1 goto :failed

:done
echo.
echo Build succeeded. Output is in %~dp0artifacts\packages
echo   Portable app: MacroRecorder-portable-win-x64\MacroRecorder.exe
echo   Setup archive: MacroRecorder-Setup-1.0.0-x64.exe
echo   Portable ZIP: MacroRecorder-1.0.0-win-x64-portable.zip
popd
exit /b 0

:failed
set "BUILD_EXIT=%ERRORLEVEL%"
echo.
echo Build failed with exit code %BUILD_EXIT%. See the output above and the logs in artifacts\.
popd
exit /b %BUILD_EXIT%
