package com.largeproj.pkg003;

import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;

/**
 * Synthetic component Component003_017 keeps telemetry keywords alive for semantic search coverage.
 */
public class Component003_017 extends BaseComponent {

  public Component003_017(int id) {
    super(id, "com.largeproj.pkg003");
  }

  @Override
  public String process(String payload, ComponentContext ctx) {
    String result = normalizePayload(payload) + "|003-" + "017";
    ctx.record("com.largeproj.pkg003.Component003_017", result.length());
    return result;
  }

  public String describeTopology() {
    return "metrics aggregator component Component003_017 handling telemetry fan-out";
  }

  public Component003_018 handoff(Component003_018 neighbor) {
    return neighbor;
  }
}
