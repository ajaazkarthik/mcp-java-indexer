package com.mcp.indexer;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.util.HashMap;
import java.util.Map;

public class MessageProtocol {
    
    private final BufferedReader reader;
    private final PrintWriter writer;
    private final Gson gson;
    private final Map<Integer, String> requestHandlers;
    
    public MessageProtocol() {
        this.reader = new BufferedReader(new InputStreamReader(System.in));
        this.writer = new PrintWriter(System.out, true);
        this.gson = new GsonBuilder().create();
        this.requestHandlers = new HashMap<>();
    }
    
    public void registerHandler(String method, RequestHandler handler) {
        requestHandlers.put(method.hashCode(), method);
    }
    
    public void sendResponse(int id, Object result) {
        JsonObject response = new JsonObject();
        response.addProperty("id", id);
        response.add("result", gson.toJsonTree(result));
        
        writer.println(gson.toJson(response));
        writer.flush();
    }
    
    public void sendError(int id, String error) {
        JsonObject response = new JsonObject();
        response.addProperty("id", id);
        response.addProperty("error", error);
        
        writer.println(gson.toJson(response));
        writer.flush();
    }
    
    public void log(String message) {
        System.err.println("[JavaIndexer] " + message);
    }
    
    public Request readRequest() throws Exception {
        String line = reader.readLine();
        if (line == null) {
            return null;
        }
        
        JsonObject json = JsonParser.parseString(line).getAsJsonObject();
        
        Request request = new Request();
        request.id = json.get("id").getAsInt();
        request.method = json.get("method").getAsString();
        request.params = json.getAsJsonObject("params");
        
        return request;
    }
    
    public static class Request {
        public int id;
        public String method;
        public JsonObject params;
    }
    
    @FunctionalInterface
    public interface RequestHandler {
        Object handle(JsonObject params) throws Exception;
    }
}
