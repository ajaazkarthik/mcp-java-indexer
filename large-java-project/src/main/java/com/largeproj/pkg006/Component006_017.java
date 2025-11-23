package com.largeproj.pkg006;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component006_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component006_017 extends BaseComponent {

  public Component006_017(int id) {
    super(id, "com.largeproj.pkg006");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|006-" + "017";
    ctx.record("com.largeproj.pkg006.Component006_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component006_017 handling telemetry fan-out";
  }

  public Component006_018 handoff(Component006_018 neighbor) {
    return neighbor;
  }
}
