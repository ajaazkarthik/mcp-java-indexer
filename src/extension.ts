import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if better-sqlite3 native module needs rebuilding and rebuild if necessary.
 * This happens silently in the background - users don't need to do anything.
 */
async function ensureNativeModules(extensionPath: string): Promise<void> {
	const serverPath = path.join(extensionPath, 'server');
	const betterSqlite3Path = path.join(serverPath, 'node_modules', 'better-sqlite3');
	
	// Check if better-sqlite3 is installed
	if (!fs.existsSync(betterSqlite3Path)) {
		console.log('better-sqlite3 not installed, sql.js will be used as fallback');
		return;
	}

	// Try to load better-sqlite3 to see if it works
	try {
		const testPath = path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node');
		if (fs.existsSync(testPath)) {
			// Try to actually require it to verify it works with current Node.js
			require(testPath);
			console.log('better-sqlite3 native module is working');
			return;
		}
	} catch (error: any) {
		console.log('better-sqlite3 needs rebuilding:', error.message);
	}

	// Need to rebuild - do it in background
	try {
		console.log('Rebuilding better-sqlite3 native module...');
		
		// Show a non-blocking notification
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: 'Java Indexer: Optimizing database...',
			cancellable: false
		}, async () => {
			try {
				await execAsync('npm rebuild better-sqlite3', { 
					cwd: serverPath,
					timeout: 120000 // 2 minute timeout
				});
				console.log('better-sqlite3 rebuilt successfully');
			} catch (rebuildError: any) {
				// Silent failure - sql.js fallback will be used
				console.log('Could not rebuild better-sqlite3, using sql.js fallback:', rebuildError.message);
			}
		});
	} catch (error: any) {
		console.log('Failed to start rebuild:', error.message);
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Java Indexer MCP extension is now active');

	// Check and rebuild native modules in background (non-blocking)
	ensureNativeModules(context.extensionPath).catch(err => {
		console.log('Native module check failed:', err);
	});

	try {
		// Register MCP server provider
		const mcpProvider = (vscode.lm as any).registerMcpServerDefinitionProvider('java-indexer-mcp', {
			provideMcpServerDefinitions: async (_token: vscode.CancellationToken) => {
				const serverPath = path.join(context.extensionPath, 'server', 'dist', 'index.js');
				console.log('MCP provider called, returning server definition:', serverPath);
				
				// CRITICAL: Increase heap size to 8GB to prevent OOM on large projects
				// Also enable manual GC and expose it via --expose-gc
				return [{
					id: 'java-indexer',
					label: 'Java Indexer',
					type: 'stdio' as const,
					command: 'node',
					args: [
						'--max-old-space-size=8192',  // 8GB heap limit
						'--expose-gc',                 // Enable manual GC
						serverPath
					],
					env: {},
				}];
			}
		});

		context.subscriptions.push(mcpProvider);
		console.log('MCP server provider registered successfully');
	} catch (error) {
		console.error('Failed to register MCP server provider:', error);
		// Continue with extension anyway
	}

	// Register commands
	let indexCommand = vscode.commands.registerCommand('java-indexer.index', async () => {
		const folder = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			title: 'Select Java Project Root'
		});

		if (folder && folder[0]) {
			const rootDir = folder[0].fsPath;
			vscode.window.showInformationMessage(`Java Indexer: Starting to index ${rootDir}`);
			// The actual indexing is done through MCP in Copilot Chat
		}
	});

	let findSymbolCommand = vscode.commands.registerCommand('java-indexer.findSymbol', async () => {
		const symbol = await vscode.window.showInputBox({
			prompt: 'Enter symbol name to find',
			placeHolder: 'e.g., UserService'
		});

		if (symbol) {
			vscode.window.showInformationMessage(`Searching for: ${symbol}`);
			// Use Copilot Chat: @java-indexer find_symbol with name: "${symbol}"
		}
	});

	let findUsagesCommand = vscode.commands.registerCommand('java-indexer.findUsages', async () => {
		const fqn = await vscode.window.showInputBox({
			prompt: 'Enter fully qualified name',
			placeHolder: 'e.g., com.example.UserService.createUser'
		});

		if (fqn) {
			vscode.window.showInformationMessage(`Finding usages of: ${fqn}`);
			// Use Copilot Chat: @java-indexer find_usages with fqn: "${fqn}"
		}
	});

	let callGraphCommand = vscode.commands.registerCommand('java-indexer.callGraph', async () => {
		const fqn = await vscode.window.showInputBox({
			prompt: 'Enter method FQN',
			placeHolder: 'e.g., com.example.UserService.createUser(User)'
		});

		if (fqn) {
			vscode.window.showInformationMessage(`Analyzing call graph for: ${fqn}`);
			// Use Copilot Chat: @java-indexer call_graph with fqn: "${fqn}"
		}
	});

	context.subscriptions.push(indexCommand, findSymbolCommand, findUsagesCommand, callGraphCommand);

	// Show welcome message
	const config = vscode.workspace.getConfiguration('javaIndexer');
	if (config.get('autoIndex')) {
		vscode.window.showInformationMessage(
			'Java Indexer MCP is ready! Use @java-indexer in Copilot Chat to index and analyze your Java projects.',
			'Learn More'
		).then(selection => {
			if (selection === 'Learn More') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/yourusername/java-indexer-mcp'));
			}
		});
	}
}

export function deactivate() {
	console.log('Java Indexer MCP extension is deactivated');
}
