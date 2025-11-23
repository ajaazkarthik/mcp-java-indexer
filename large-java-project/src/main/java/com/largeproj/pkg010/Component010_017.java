package com.largeproj.pkg010;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component010_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component010_017 extends BaseComponent {

  public Component010_017(int id) {
    super(id, "com.largeproj.pkg010");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|010-" + "017";
    ctx.record("com.largeproj.pkg010.Component010_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component010_017 handling telemetry fan-out";
  }

  public Component010_018 handoff(Component010_018 neighbor) {
    return neighbor;
  }
}
