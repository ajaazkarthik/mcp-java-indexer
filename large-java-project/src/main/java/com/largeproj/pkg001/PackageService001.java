package com.largeproj.pkg001;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 001 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService001 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService001() {
    components.add(new Component001_000(0));
    components.add(new Component001_001(1));
    components.add(new Component001_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-001";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 001 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
