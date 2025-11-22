@echo off
echo Compiling Java Indexer MCP Extension...
echo.

echo [1/2] Compiling extension TypeScript...
cd /d "%~dp0"
node_modules\.bin\tsc -p .\tsconfig.json
if errorlevel 1 (
    echo ERROR: Extension compilation failed!
    exit /b 1
)
echo Extension compiled successfully!
echo.

echo [2/2] Compiling server TypeScript...
cd server
call ..\node_modules\.bin\tsc -p .\tsconfig.json
if errorlevel 1 (
    echo ERROR: Server compilation failed!
    exit /b 1
)
echo Server compiled successfully!
echo.

echo.
echo ========================================
echo   Compilation Complete!
echo ========================================
echo   Extension: dist\extension.js
echo   Server: server\dist\index.js
echo   Java JAR: java-indexer\target\java-indexer-1.0.0.jar
echo ========================================
