package com.largeproj.pkg070;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 070 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService070 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService070() {
    components.add(new Component070_000(0));
    components.add(new Component070_001(1));
    components.add(new Component070_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-070";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 070 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
