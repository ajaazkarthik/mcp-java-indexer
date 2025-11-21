@echo off
REM Quick test script for MCP Java Indexer

echo Testing MCP Java Indexer...
echo.

cd server

REM Create test request
echo {"id":1,"method":"indexFile","params":{"filePath":"D:/workspace/repo/github-playground/mcp-java-indexer/example-java-project/src/main/java/com/example/demo/User.java","sourceRoots":["D:/workspace/repo/github-playground/mcp-java-indexer/example-java-project/src/main/java"]}} > test-request.json

REM Run Java indexer
echo Testing Java indexer...
java -jar ../java-indexer/target/java-indexer-1.0.0.jar < test-request.json

del test-request.json
cd ..

echo.
echo Test complete!
