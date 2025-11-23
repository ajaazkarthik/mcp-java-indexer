package com.largeproj.pkg001;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component001_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component001_000 extends BaseComponent {

  public Component001_000(int id) {
    super(id, "com.largeproj.pkg001");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|001-" + "000";
    ctx.record("com.largeproj.pkg001.Component001_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component001_000 handling telemetry fan-out";
  }

  public Component001_001 handoff(Component001_001 neighbor) {
    return neighbor;
  }
}
