# Changelog v1.5.3

**Release Date:** November 24, 2025

## Changes

### Timeout Increase
- **Increased timeout from 600s (10 minutes) to 1800s (30 minutes)**
  - Allows indexing of extremely large projects (30k+ files)
  - Prevents timeout on complex codebases with deep inheritance hierarchies
  - Heartbeat mechanism still active (every 50 files or 45 seconds)

### Technical Details
- Updated `REQUEST_TIMEOUT` in `indexer-client.ts`: 600000ms → 1800000ms
- All other performance optimizations from v1.5.2 preserved
- Test suite: 41 tests (100% pass rate)

## Compatibility
- Backward compatible with v1.5.0, v1.5.1, v1.5.2
- No API changes
- No feature changes

## Use Case
This release is specifically for users working with:
- Very large enterprise codebases (20k+ Java files)
- Projects with extensive dependency graphs
- Complex inheritance hierarchies requiring longer parse times

## Performance Profile
- Small projects (< 1k files): ~5-10s
- Medium projects (1k-10k files): ~30-60s
- Large projects (10k-20k files): ~2-5 minutes
- Very large projects (20k-30k files): ~5-15 minutes
- Maximum timeout: 30 minutes

## Recommendations
- Monitor indexing progress via heartbeat logs
- Consider splitting extremely large monorepos if timeout still occurs
- Ensure adequate system resources (minimum 4GB RAM for large projects)
