@echo off
echo Building MCP Java Indexer v1.4.0...
echo.

REM Clean and build
echo Step 1: Building Java indexer...
cd java-indexer
call mvn clean package -q
if errorlevel 1 (
    echo ERROR: Java build failed
    exit /b 1
)
cd ..

echo Step 2: Building TypeScript server...
cd server
call npm run build
if errorlevel 1 (
    echo ERROR: TypeScript build failed
    exit /b 1
)
cd ..

echo Step 3: Building extension...
call npm run compile
if errorlevel 1 (
    echo ERROR: Extension build failed
    exit /b 1
)

echo.
echo ✓ Build complete!
echo.
echo To create VSIX package, run:
echo   npx vsce package --out java-indexer-mcp-1.4.0.vsix
echo.
echo To publish to marketplace, run:
echo   npx vsce publish
echo.
