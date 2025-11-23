package com.largeproj.pkg006;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component006_000 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component006_000 extends BaseComponent {

  public Component006_000(int id) {
    super(id, "com.largeproj.pkg006");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|006-" + "000";
    ctx.record("com.largeproj.pkg006.Component006_000", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component006_000 handling telemetry fan-out";
  }

  public Component006_001 handoff(Component006_001 neighbor) {
    return neighbor;
  }
}
