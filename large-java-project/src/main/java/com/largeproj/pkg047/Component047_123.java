package com.largeproj.pkg047;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component047_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component047_123 extends BaseComponent {

  public Component047_123(int id) {
    super(id, "com.largeproj.pkg047");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|047-" + "123";
    ctx.record("com.largeproj.pkg047.Component047_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component047_123 handling telemetry fan-out";
  }

  public Component047_124 handoff(Component047_124 neighbor) {
    return neighbor;
  }
}
