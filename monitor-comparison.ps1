# Storage Backend vs In-Memory - Live Monitoring Script
# Run this while using both extensions to track differences

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   MCP Java Indexer - Dual Version Monitor             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$logFile = "comparison-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
Write-Host "📝 Logging to: $logFile" -ForegroundColor Yellow
Write-Host ""

function Get-JavaIndexerProcesses {
    $processes = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -like "*java-indexer*" -or 
        $_.CommandLine -like "*java-indexer*" -or
        $_.Path -like "*mcp-java-indexer*"
    }
    
    if (-not $processes) {
        # Try alternative detection
        $processes = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
            $_.WorkingSet -gt 50MB
        } | Select-Object -First 2
    }
    
    return $processes
}

function Format-Bytes {
    param([long]$bytes)
    if ($bytes -gt 1GB) { return "{0:N2} GB" -f ($bytes / 1GB) }
    if ($bytes -gt 1MB) { return "{0:N2} MB" -f ($bytes / 1MB) }
    if ($bytes -gt 1KB) { return "{0:N2} KB" -f ($bytes / 1KB) }
    return "$bytes B"
}

function Get-DatabaseSizes {
    $results = @{
        Memory = @{ JSON = 0; Total = 0 }
        Storage = @{ DB = 0; Total = 0 }
    }
    
    # Check example project
    $examplePath = ".\example-java-project\.mcp-index"
    if (Test-Path $examplePath) {
        $jsonPath = Join-Path $examplePath "index.json"
        $dbPath = Join-Path $examplePath "index.db"
        
        if (Test-Path $jsonPath) {
            $results.Memory.JSON = (Get-Item $jsonPath).Length
            $results.Memory.Total = $results.Memory.JSON
        }
        
        if (Test-Path $dbPath) {
            $results.Storage.DB = (Get-Item $dbPath).Length
            $results.Storage.Total = $results.Storage.DB
        }
    }
    
    # Check large project
    $largePath = ".\large-java-project\.mcp-index"
    if (Test-Path $largePath) {
        $dbPath = Join-Path $largePath "index.db"
        if (Test-Path $dbPath) {
            $results.Storage.DB = (Get-Item $dbPath).Length
            $results.Storage.Total = $results.Storage.DB
        }
    }
    
    return $results
}

Write-Host "🔍 Scanning for MCP Java Indexer processes..." -ForegroundColor Cyan
Write-Host ""

$iteration = 0
$startTime = Get-Date

try {
    while ($true) {
        $iteration++
        $currentTime = Get-Date
        $elapsed = ($currentTime - $startTime).TotalSeconds
        
        Clear-Host
        
        Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
        Write-Host "║   MCP Java Indexer - Live Comparison Monitor          ║" -ForegroundColor Cyan
        Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "⏱️  Running for: $([math]::Floor($elapsed))s | Iteration: $iteration | Log: $logFile" -ForegroundColor Gray
        Write-Host ""
        
        # Get processes
        $processes = Get-JavaIndexerProcesses
        
        if ($processes) {
            Write-Host "📊 PROCESS COMPARISON" -ForegroundColor Green
            Write-Host "═" * 80 -ForegroundColor Gray
            Write-Host ""
            
            $processArray = @($processes)
            
            if ($processArray.Count -ge 2) {
                $p1 = $processArray[0]
                $p2 = $processArray[1]
                
                Write-Host ("   Process 1 (Memory?)".PadRight(40)) -ForegroundColor Yellow -NoNewline
                Write-Host ("Process 2 (Storage?)") -ForegroundColor Cyan
                Write-Host ("   " + "─" * 78) -ForegroundColor Gray
                
                # PID
                Write-Host ("   PID: " + $p1.Id.ToString().PadRight(33)) -NoNewline
                Write-Host ("PID: " + $p2.Id)
                
                # Memory
                $mem1 = Format-Bytes $p1.WorkingSet64
                $mem2 = Format-Bytes $p2.WorkingSet64
                Write-Host ("   Memory: " + $mem1.PadRight(31)) -NoNewline
                Write-Host ("Memory: " + $mem2)
                
                # CPU
                Write-Host ("   CPU: " + $p1.CPU.ToString("F2").PadRight(32) + "s") -NoNewline
                Write-Host ("CPU: " + $p2.CPU.ToString("F2") + "s")
                
                # Threads
                Write-Host ("   Threads: " + $p1.Threads.Count.ToString().PadRight(29)) -NoNewline
                Write-Host ("Threads: " + $p2.Threads.Count)
                
                # Calculate difference
                $memDiff = $p2.WorkingSet64 - $p1.WorkingSet64
                $memDiffPct = if ($p1.WorkingSet64 -gt 0) { ($memDiff / $p1.WorkingSet64) * 100 } else { 0 }
                
                Write-Host ""
                if ($memDiff -lt 0) {
                    Write-Host ("   💡 Process 2 uses " + (Format-Bytes ([math]::Abs($memDiff))) + " LESS memory") -ForegroundColor Green
                    Write-Host ("      (" + [math]::Abs($memDiffPct).ToString("F1") + "% reduction)") -ForegroundColor Green
                } else {
                    Write-Host ("   ⚠️  Process 2 uses " + (Format-Bytes $memDiff) + " MORE memory") -ForegroundColor Red
                    Write-Host ("      (+" + $memDiffPct.ToString("F1") + "%)") -ForegroundColor Red
                }
                
            } elseif ($processArray.Count -eq 1) {
                $p = $processArray[0]
                Write-Host ("   ⚠️  Only ONE process found") -ForegroundColor Yellow
                Write-Host ("   PID: " + $p.Id)
                Write-Host ("   Memory: " + (Format-Bytes $p.WorkingSet64))
                Write-Host ("   CPU: " + $p.CPU.ToString("F2") + "s")
                Write-Host ("   Threads: " + $p.Threads.Count)
            }
            
        } else {
            Write-Host "⚠️  NO MCP JAVA INDEXER PROCESSES FOUND" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "   Make sure both servers are running in VS Code:" -ForegroundColor Gray
            Write-Host "   1. Check VS Code Copilot Chat is open" -ForegroundColor Gray
            Write-Host "   2. Type: @java-indexer-memory help" -ForegroundColor Gray
            Write-Host "   3. Type: @java-indexer-storage help" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "💾 STORAGE COMPARISON" -ForegroundColor Green
        Write-Host "═" * 80 -ForegroundColor Gray
        Write-Host ""
        
        $sizes = Get-DatabaseSizes
        
        Write-Host "   In-Memory (JSON):" -ForegroundColor Yellow
        Write-Host ("     " + (Format-Bytes $sizes.Memory.Total).PadRight(20))
        
        Write-Host ""
        Write-Host "   Storage Backend (SQLite):" -ForegroundColor Cyan
        Write-Host ("     " + (Format-Bytes $sizes.Storage.Total).PadRight(20))
        
        if ($sizes.Storage.Total -gt 0 -and $sizes.Memory.Total -gt 0) {
            $sizeDiff = $sizes.Storage.Total - $sizes.Memory.Total
            $sizeDiffPct = ($sizeDiff / $sizes.Memory.Total) * 100
            
            Write-Host ""
            if ($sizeDiff -gt 0) {
                Write-Host ("   📦 SQLite is " + (Format-Bytes $sizeDiff) + " larger") -ForegroundColor Yellow
            } else {
                Write-Host ("   📦 SQLite is " + (Format-Bytes ([math]::Abs($sizeDiff))) + " smaller") -ForegroundColor Green
            }
        }
        
        Write-Host ""
        Write-Host "🎯 QUICK ACTIONS" -ForegroundColor Green
        Write-Host "═" * 80 -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Test in VS Code Copilot Chat:" -ForegroundColor Gray
        Write-Host "   • @java-indexer-memory index_project" -ForegroundColor White
        Write-Host "   • @java-indexer-storage index_project" -ForegroundColor White
        Write-Host ""
        Write-Host "   Press Ctrl+C to stop monitoring" -ForegroundColor Gray
        Write-Host ""
        
        # Log to file
        $logEntry = "[$currentTime] P1: $(if ($processArray.Count -ge 1) {Format-Bytes $processArray[0].WorkingSet64} else {'N/A'}) | P2: $(if ($processArray.Count -ge 2) {Format-Bytes $processArray[1].WorkingSet64} else {'N/A'})"
        Add-Content -Path $logFile -Value $logEntry
        
        Start-Sleep -Seconds 3
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error: $_" -ForegroundColor Red
} finally {
    Write-Host ""
    Write-Host "✅ Monitoring stopped. Log saved to: $logFile" -ForegroundColor Green
}
