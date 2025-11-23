package com.largeproj.pkg006;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 006 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService006 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService006() {
    components.add(new Component006_000(0));
    components.add(new Component006_001(1));
    components.add(new Component006_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-006";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 006 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
