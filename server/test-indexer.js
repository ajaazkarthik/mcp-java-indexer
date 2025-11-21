const { IndexerClient } = await import('./dist/indexer-client.js');
const client = new IndexerClient();

try {
  console.log('Starting Java indexer...');
  await client.start();
  console.log('Java indexer started successfully');
  
  const result = await client.indexFile(
    'D:/workspace/repo/github-playground/mcp-java-indexer/example-java-project/src/main/java/com/example/demo/User.java',
    ['D:/workspace/repo/github-playground/mcp-java-indexer/example-java-project/src/main/java']
  );
  
  console.log('Index result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}
