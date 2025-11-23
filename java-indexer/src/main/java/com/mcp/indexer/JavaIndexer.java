package com.mcp.indexer;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import com.mcp.indexer.MessageProtocol.Request;
import com.mcp.indexer.StubModel.*;

import java.util.ArrayList;
import java.util.List;

public class JavaIndexer {
    
    private static final Gson gson = new Gson();
    private static ParserService parserService;
    
    public static void main(String[] args) {
        MessageProtocol protocol = new MessageProtocol();
        
        try {
            protocol.log("Java Indexer started");
            
            // Main event loop
            while (true) {
                Request request = protocol.readRequest();
                
                if (request == null) {
                    protocol.log("EOF received, exiting");
                    break;
                }
                
                protocol.log("Received request: " + request.method);
                
                try {
                    Object result = handleRequest(request, protocol);
                    protocol.sendResponse(request.id, result);
                } catch (Exception e) {
                    protocol.log("Error handling request: " + e.getMessage());
                    e.printStackTrace(System.err);
                    protocol.sendError(request.id, e.getMessage());
                }
            }
            
        } catch (Exception e) {
            System.err.println("Fatal error: " + e.getMessage());
            e.printStackTrace(System.err);
            System.exit(1);
        }
    }
    
    private static Object handleRequest(Request request, MessageProtocol protocol) throws Exception {
        switch (request.method) {
            case "indexFile":
                return handleIndexFile(request.params, protocol);
                
            case "indexFiles":
                return handleIndexFiles(request.params, protocol);
                
            case "resolveType":
                return handleResolveType(request.params, protocol);
                
            default:
                throw new Exception("Unknown method: " + request.method);
        }
    }
    
    private static IndexResult handleIndexFile(JsonObject params, MessageProtocol protocol) {
        String filePath = params.get("filePath").getAsString();
        List<String> sourceRoots = parseSourceRoots(params.get("sourceRoots").getAsJsonArray());
        
        protocol.log("Indexing file: " + filePath);
        
        // Initialize parser service if needed
        if (parserService == null || !sourceRoots.isEmpty()) {
            parserService = new ParserService(sourceRoots);
        }
        
        IndexResult result = parserService.indexFile(filePath);
        
        protocol.log("Indexed " + filePath + ": " + result.symbols.size() + " symbols, " + 
                    result.references.size() + " references");
        
        return result;
    }
    
    private static List<IndexResult> handleIndexFiles(JsonObject params, MessageProtocol protocol) {
        JsonArray filePathsArray = params.get("filePaths").getAsJsonArray();
        List<String> filePaths = new ArrayList<>();
        filePathsArray.forEach(elem -> filePaths.add(elem.getAsString()));
        
        List<String> sourceRoots = parseSourceRoots(params.get("sourceRoots").getAsJsonArray());
        
        protocol.log("Indexing " + filePaths.size() + " files");
        
        // Initialize parser service (reuse when possible)
        if (parserService == null || !sourceRoots.isEmpty()) {
            parserService = new ParserService(sourceRoots);
        }
        
        List<IndexResult> results = new ArrayList<>(filePaths.size()); // Pre-allocate capacity
        int count = 0;
        int totalSymbols = 0;
        int totalRefs = 0;
        
        for (String filePath : filePaths) {
            IndexResult result = parserService.indexFile(filePath);
            results.add(result);
            
            count++;
            if (result.error == null) {
                totalSymbols += result.symbols.size();
                totalRefs += result.references.size();
            }
            
            // Reduced logging - only every 50 files for large batches
            if (count % 50 == 0 || count == filePaths.size()) {
                protocol.log("Indexed " + count + "/" + filePaths.size() + " files (" + 
                           totalSymbols + " symbols, " + totalRefs + " refs)");
            }
        }
        
        protocol.log("Completed indexing " + filePaths.size() + " files - Total: " + 
                    totalSymbols + " symbols, " + totalRefs + " references");
        
        return results;
    }
    
    private static String handleResolveType(JsonObject params, MessageProtocol protocol) {
        String typeName = params.get("typeName").getAsString();
        String context = params.get("context").getAsString();
        List<String> sourceRoots = parseSourceRoots(params.get("sourceRoots").getAsJsonArray());
        
        protocol.log("Resolving type: " + typeName + " in context: " + context);
        
        // Basic type resolution (can be enhanced)
        // For now, return the type name as-is
        return typeName;
    }
    
    private static List<String> parseSourceRoots(JsonArray array) {
        List<String> roots = new ArrayList<>();
        if (array != null) {
            array.forEach(elem -> roots.add(elem.getAsString()));
        }
        return roots;
    }
}
