package com.largeproj.pkg001;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component001_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component001_123 extends BaseComponent {

  public Component001_123(int id) {
    super(id, "com.largeproj.pkg001");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|001-" + "123";
    ctx.record("com.largeproj.pkg001.Component001_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component001_123 handling telemetry fan-out";
  }

  public Component001_124 handoff(Component001_124 neighbor) {
    return neighbor;
  }
}
