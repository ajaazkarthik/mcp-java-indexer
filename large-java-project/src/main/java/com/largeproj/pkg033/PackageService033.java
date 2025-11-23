package com.largeproj.pkg033;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 033 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService033 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService033() {
    components.add(new Component033_000(0));
    components.add(new Component033_001(1));
    components.add(new Component033_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-033";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 033 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
