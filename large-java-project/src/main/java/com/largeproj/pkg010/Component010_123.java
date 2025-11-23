package com.largeproj.pkg010;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component010_123 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component010_123 extends BaseComponent {

  public Component010_123(int id) {
    super(id, "com.largeproj.pkg010");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|010-" + "123";
    ctx.record("com.largeproj.pkg010.Component010_123", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component010_123 handling telemetry fan-out";
  }

  public Component010_124 handoff(Component010_124 neighbor) {
    return neighbor;
  }
}
