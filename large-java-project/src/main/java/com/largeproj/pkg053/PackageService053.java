package com.largeproj.pkg053;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 053 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService053 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService053() {
    components.add(new Component053_000(0));
    components.add(new Component053_001(1));
    components.add(new Component053_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-053";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 053 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
