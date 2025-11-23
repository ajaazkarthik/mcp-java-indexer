package com.largeproj.pkg073;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component073_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component073_123 extends BaseComponent {

  public Component073_123(int id) {
    super(id, "com.largeproj.pkg073");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|073-" + "123";
    ctx.record("com.largeproj.pkg073.Component073_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component073_123 handling telemetry fan-out";
  }

  public Component073_124 handoff(Component073_124 neighbor) {
    return neighbor;
  }
}
