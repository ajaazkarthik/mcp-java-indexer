package com.mcp.indexer;

import com.mcp.indexer.StubModel.*;
import java.util.*;
import java.util.stream.Collectors;

public class CallGraphBuilder {
    
    private final Map<String, List<Reference>> callGraph; // caller -> callees
    private final Map<String, List<Reference>> reverseCallGraph; // callee -> callers
    
    public CallGraphBuilder() {
        this.callGraph = new HashMap<>();
        this.reverseCallGraph = new HashMap<>();
    }
    
    public void addReferences(List<Reference> references) {
        for (Reference ref : references) {
            if (ref.kind.equals("method_call")) {
                // Forward graph
                callGraph.computeIfAbsent(ref.fromFqn, k -> new ArrayList<>()).add(ref);
                
                // Reverse graph
                reverseCallGraph.computeIfAbsent(ref.toFqn, k -> new ArrayList<>()).add(ref);
            }
        }
    }
    
    public List<Reference> getOutboundCalls(String methodFqn) {
        return callGraph.getOrDefault(methodFqn, Collections.emptyList());
    }
    
    public List<Reference> getInboundCalls(String methodFqn) {
        return reverseCallGraph.getOrDefault(methodFqn, Collections.emptyList());
    }
    
    public Map<String, Integer> getCallStatistics() {
        Map<String, Integer> stats = new HashMap<>();
        stats.put("totalMethods", callGraph.size() + reverseCallGraph.size());
        stats.put("totalCalls", callGraph.values().stream()
            .mapToInt(List::size)
            .sum());
        return stats;
    }
    
    public void clear() {
        callGraph.clear();
        reverseCallGraph.clear();
    }
}
