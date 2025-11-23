#!/usr/bin/env pwsh
# Quick validation script for v1.5.0 improvements

Write-Host "`n=== MCP Java Indexer v1.5.0 - Quick Validation ===" -ForegroundColor Cyan
Write-Host "Testing critical features...`n" -ForegroundColor Cyan

$passed = 0
$failed = 0

function Test-Feature {
    param($name, $scriptBlock)
    Write-Host "Testing: $name" -ForegroundColor Yellow
    try {
        $result = & $scriptBlock
        if ($result) {
            Write-Host "  ✅ PASS" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "  ❌ FAIL" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "  ❌ ERROR: $_" -ForegroundColor Red
        $script:failed++
    }
    Write-Host ""
}

# Test 1: TypeScript compilation
Test-Feature "TypeScript builds cleanly" {
    Push-Location server
    $output = npm run build 2>&1 | Out-String
    Pop-Location
    return $output -notmatch "error TS"
}

# Test 2: Java compilation
Test-Feature "Java Maven build succeeds" {
    Push-Location java-indexer
    $output = mvn -q clean package -DskipTests 2>&1 | Out-String
    Pop-Location
    return $output -match "BUILD SUCCESS"
}

# Test 3: Symbol resolver exists
Test-Feature "SymbolResolver class exists" {
    return (Test-Path "server\src\symbol-resolver.ts")
}

# Test 4: Enhanced semantic search exists
Test-Feature "Semantic Search v2 exists" {
    return (Test-Path "server\src\tools\semantic_search_v2.ts")
}

# Test 5: ReferenceExtractor has annotation methods
Test-Feature "ReferenceExtractor has annotation tracking" {
    $content = Get-Content "java-indexer\src\main\java\com\mcp\indexer\ReferenceExtractor.java" -Raw
    return $content -match "extractAnnotationReferences"
}

# Test 6: Documentation exists
Test-Feature "v1.5.0 documentation complete" {
    $docs = @(
        "IMPROVEMENTS_v1.5.0.md",
        "QUICK_REFERENCE_v1.5.0.md",
        "IMPLEMENTATION_SUMMARY_v1.5.0.md",
        "CHANGELOG_v1.5.0.md"
    )
    foreach ($doc in $docs) {
        if (-not (Test-Path $doc)) { return $false }
    }
    return $true
}

# Test 7: Updated tools import resolver
Test-Feature "Tools use SymbolResolver" {
    $findUsages = Get-Content "server\src\tools\find_usages.ts" -Raw
    return $findUsages -match "import.*SymbolResolver"
}

# Test 8: Example project exists
Test-Feature "Test project available" {
    return (Test-Path "example-java-project\src")
}

# Summary
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
$total = $passed + $failed
if ($total -gt 0) {
    $rate = [math]::Round(($passed / $total) * 100, 1)
    Write-Host "Success Rate: $rate%" -ForegroundColor Yellow
}

if ($failed -eq 0) {
    Write-Host "`n🎉 All validation checks passed! v1.5.0 is ready!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️  Some checks failed. Review above for details." -ForegroundColor Yellow
    exit 1
}
