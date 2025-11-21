@echo off
REM Build script for MCP Java Indexer

echo.
echo Building MCP Java Indexer...
echo.

REM Check Java
echo Checking prerequisites...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Java not found. Please install Java 8 or higher.
    exit /b 1
)
echo [OK] Java found

REM Check Maven
mvn -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Maven not found. Please install Maven 3.6 or higher.
    exit /b 1
)
echo [OK] Maven found

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18 or higher.
    exit /b 1
)
echo [OK] Node.js found

echo.
echo Building Java Indexer...
cd java-indexer
call mvn clean package -q
if %errorlevel% neq 0 (
    echo [ERROR] Java Indexer build failed
    cd ..
    exit /b 1
)
cd ..
echo [OK] Java Indexer built successfully

echo.
echo Building Node.js Server...
cd server
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Node.js Server build failed
    cd ..
    exit /b 1
)
cd ..
echo [OK] Node.js Server built successfully

echo.
echo ========================================
echo BUILD COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Configure VS Code MCP settings at:
echo    %%APPDATA%%\Code\User\globalStorage\github.copilot-chat\mcp.json
echo.
echo 2. Add this configuration:
echo    {
echo      "mcpServers": {
echo        "java-indexer": {
echo          "command": "node",
echo          "args": ["%CD%\server\dist\index.js"]
echo        }
echo      }
echo    }
echo.
echo 3. Restart VS Code
echo.
echo 4. Test: @java-indexer index_project with rootDir: "C:/your-java-project"
echo.
