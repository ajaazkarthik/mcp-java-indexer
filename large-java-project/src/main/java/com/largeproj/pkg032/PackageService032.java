package com.largeproj.pkg032;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 032 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService032 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService032() {
    components.add(new Component032_000(0));
    components.add(new Component032_001(1));
    components.add(new Component032_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-032";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 032 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
