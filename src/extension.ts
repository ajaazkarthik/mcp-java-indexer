import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	console.log('Java Indexer MCP extension is now active');

	try {
		// Register MCP server provider
		const mcpProvider = (vscode.lm as any).registerMcpServerDefinitionProvider('java-indexer-mcp', {
			provideMcpServerDefinitions: async (_token: vscode.CancellationToken) => {
				const serverPath = path.join(context.extensionPath, 'server', 'dist', 'index.js');
				console.log('MCP provider called, returning server definition:', serverPath);
				
				return [{
					id: 'java-indexer',
					label: 'Java Indexer',
					type: 'stdio' as const,
					command: 'node',
					args: [serverPath],
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
