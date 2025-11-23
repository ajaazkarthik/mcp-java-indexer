package com.largeproj.pkg023;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 023 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService023 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService023() {
    components.add(new Component023_000(0));
    components.add(new Component023_001(1));
    components.add(new Component023_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-023";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 023 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
