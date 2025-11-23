#!/usr/bin/env pwsh
# run-all-tests.ps1 - Simple test runner

$ErrorActionPreference = "Continue"
$allPassed = $true
$totalStart = Get-Date

Write-Host "`n===================================================================" -ForegroundColor Cyan
Write-Host "   MCP Java Indexer - Test Suite Runner" -ForegroundColor Cyan
Write-Host "===================================================================`n" -ForegroundColor Cyan

# Feature Tests
Write-Host "===============================================================" -ForegroundColor Magenta
Write-Host "TEST SUITE 1: Feature Preservation - 26 tests" -ForegroundColor Yellow
Write-Host "===============================================================`n" -ForegroundColor Magenta

$test1Start = Get-Date
node test-feature-preservation.js
$test1Exit = $LASTEXITCODE
$test1Duration = ((Get-Date) - $test1Start).TotalSeconds

if ($test1Exit -eq 0) {
    Write-Host "`nFeature Preservation Tests: PASSED" -ForegroundColor Green
} else {
    Write-Host "`nFeature Preservation Tests: FAILED" -ForegroundColor Red
    $allPassed = $false
}
Write-Host "Duration: $([math]::Round($test1Duration, 2))s`n" -ForegroundColor Cyan

# Large Project Tests
Write-Host "===============================================================" -ForegroundColor Magenta
Write-Host "TEST SUITE 2: Large Project Validation - 15 tests" -ForegroundColor Yellow
Write-Host "===============================================================`n" -ForegroundColor Magenta

Remove-Item "large-java-project\.mcp-index" -Recurse -Force -ErrorAction SilentlyContinue

$test2Start = Get-Date
node test-large-project.js
$test2Exit = $LASTEXITCODE
$test2Duration = ((Get-Date) - $test2Start).TotalSeconds

if ($test2Exit -eq 0) {
    Write-Host "`nLarge Project Tests: PASSED" -ForegroundColor Green
} else {
    Write-Host "`nLarge Project Tests: FAILED" -ForegroundColor Red
    $allPassed = $false
}
Write-Host "Duration: $([math]::Round($test2Duration, 2))s`n" -ForegroundColor Cyan

# Summary
$totalDuration = ((Get-Date) - $totalStart).TotalSeconds

Write-Host "`n===================================================================" -ForegroundColor Cyan
Write-Host "                    FINAL SUMMARY" -ForegroundColor Cyan
Write-Host "===================================================================`n" -ForegroundColor Cyan

Write-Host "Test Suites: 2" -ForegroundColor White
Write-Host "Total Tests: 41 (26 feature + 15 integration)" -ForegroundColor White
Write-Host "Total Duration: $([math]::Round($totalDuration, 2))s`n" -ForegroundColor White

if ($allPassed) {
    Write-Host "===============================================================" -ForegroundColor Green
    Write-Host "   ALL TESTS PASSED - 100% Success Rate" -ForegroundColor Green
    Write-Host "===============================================================`n" -ForegroundColor Green
    
    Write-Host "Feature Tests: 26/26 PASSED" -ForegroundColor Green
    Write-Host "Integration Tests: 15/15 PASSED" -ForegroundColor Green
    Write-Host "`nREADY FOR COMMIT/RELEASE`n" -ForegroundColor Green
    
    exit 0
} else {
    Write-Host "===============================================================" -ForegroundColor Red
    Write-Host "   TESTS FAILED - Action Required" -ForegroundColor Red
    Write-Host "===============================================================`n" -ForegroundColor Red
    
    if ($test1Exit -ne 0) {
        Write-Host "Feature Tests: FAILED" -ForegroundColor Red
        Write-Host "Critical features may have been removed!" -ForegroundColor Yellow
    }
    
    if ($test2Exit -ne 0) {
        Write-Host "Integration Tests: FAILED" -ForegroundColor Red
    }
    
    Write-Host "`nDO NOT COMMIT UNTIL ALL TESTS PASS`n" -ForegroundColor Red
    
    exit 1
}
