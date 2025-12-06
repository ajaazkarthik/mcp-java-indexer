const IndexerClient = require('../server/dist/indexer-client.js').IndexerClient;

(async () => {
  const ic = new IndexerClient.IndexerClient ? new IndexerClient.IndexerClient() : new IndexerClient();
  console.log('numWorkers (accessible):', ic.numWorkers ?? ic._numWorkers ?? ic.numWorkers);
  console.log('javaExec (accessible):', ic.javaExec ?? ic._javaExec ?? ic.javaExec);
})();
