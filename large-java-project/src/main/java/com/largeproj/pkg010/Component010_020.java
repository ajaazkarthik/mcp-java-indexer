package com.largeproj.pkg010;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component010_020 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component010_020 extends BaseComponent {

  public Component010_020(int id) {
    super(id, "com.largeproj.pkg010");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|010-" + "020";
    ctx.record("com.largeproj.pkg010.Component010_020", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component010_020 handling telemetry fan-out";
  }

  public Component010_021 handoff(Component010_021 neighbor) {
    return neighbor;
  }
}
