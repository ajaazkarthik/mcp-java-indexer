package com.largeproj.pkg006;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component006_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component006_002 extends BaseComponent {

  public Component006_002(int id) {
    super(id, "com.largeproj.pkg006");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|006-" + "002";
    ctx.record("com.largeproj.pkg006.Component006_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component006_002 handling telemetry fan-out";
  }

  public Component006_003 handoff(Component006_003 neighbor) {
    return neighbor;
  }
}
