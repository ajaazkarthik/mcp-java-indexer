package com.largeproj.pkg001;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component001_125 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component001_125 extends BaseComponent {

  public Component001_125(int id) {
    super(id, "com.largeproj.pkg001");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|001-" + "125";
    ctx.record("com.largeproj.pkg001.Component001_125", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component001_125 handling telemetry fan-out";
  }

  public Component001_126 handoff(Component001_126 neighbor) {
    return neighbor;
  }
}
