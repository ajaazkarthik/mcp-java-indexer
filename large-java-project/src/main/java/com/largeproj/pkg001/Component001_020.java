package com.largeproj.pkg001;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component001_020 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component001_020 extends BaseComponent {

  public Component001_020(int id) {
    super(id, "com.largeproj.pkg001");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|001-" + "020";
    ctx.record("com.largeproj.pkg001.Component001_020", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component001_020 handling telemetry fan-out";
  }

  public Component001_021 handoff(Component001_021 neighbor) {
    return neighbor;
  }
}
