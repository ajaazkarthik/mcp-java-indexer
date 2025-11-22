# Memory Tool Fix Applied

## Issue
The agent-memory extension was installed but the memory tool was not available to AI agents in Copilot Chat.

## Root Cause
The setting 'languageModelTools.enabled' was missing from VS Code user settings. This setting is required to enable language model tools provided by extensions.

## Fix Applied
Added the following to: %APPDATA%\Code\User\settings.json

    'languageModelTools.enabled': true

## What This Enables
- The 'memory' tool from digitarald.agent-memory@0.1.66
- AI agents can now create, read, update, and delete files in the /memories directory
- Memory persists across chat sessions (default storage: workspace-state)

## Next Steps
1. Reload VS Code window (Ctrl+Shift+P -> 'Developer: Reload Window')
2. The memory tool should now be available to agents
3. Agents will automatically use it according to the instructions in memory-usage.instructions.md

## Verification
After reload, agents should be able to:
- Use memory view command to check for earlier progress
- Record status/progress/thoughts in memory files
- Maintain context across conversation resets

## Configuration Options (Optional)
- agentMemory.storageBackend: workspace-state (default), branch-state, disk, or secret
- agentMemory.autoSyncToFile: Auto-sync memory to a file like 'AGENTS.md'
- agentMemory.tldr.enabled: Auto-generate TL;DR summaries (default: true)

Date: 2025-11-23 08:04:47
