package com.largeproj.pkg010;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component010_002 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component010_002 extends BaseComponent {

  public Component010_002(int id) {
    super(id, "com.largeproj.pkg010");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|010-" + "002";
    ctx.record("com.largeproj.pkg010.Component010_002", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component010_002 handling telemetry fan-out";
  }

  public Component010_003 handoff(Component010_003 neighbor) {
    return neighbor;
  }
}
