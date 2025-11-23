package com.largeproj.pkg010;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component010_001 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component010_001 extends BaseComponent {

  public Component010_001(int id) {
    super(id, "com.largeproj.pkg010");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|010-" + "001";
    ctx.record("com.largeproj.pkg010.Component010_001", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component010_001 handling telemetry fan-out";
  }

  public Component010_002 handoff(Component010_002 neighbor) {
    return neighbor;
  }
}
