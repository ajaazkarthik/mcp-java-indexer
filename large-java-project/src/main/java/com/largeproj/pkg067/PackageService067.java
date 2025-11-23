package com.largeproj.pkg067;

import java.util.ArrayList;
import java.util.List;
import com.largeproj.core.BaseComponent;
import com.largeproj.core.ComponentContext;
import com.largeproj.core.ComponentContextImpl;
import com.largeproj.core.TelemetryService;

/**
 * PackageService 067 orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.
 */
public class PackageService067 implements TelemetryService {
  private final List<BaseComponent> components = new ArrayList<>();

  public PackageService067() {
    components.add(new Component067_000(0));
    components.add(new Component067_001(1));
    components.add(new Component067_002(2));
  }

  @Override
  public String streamMetrics(ComponentContext ctx) {
    String payload = "pkg-067";
    for (BaseComponent component : components) {
      payload = component.process(payload, ctx);
    }
    return payload;
  }

  @Override
  public String analyticsReport(ComponentContext ctx) {
    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();
    String metrics = streamMetrics(impl);
    return "telemetry metrics aggregator 067 -> " + metrics;
  }

  public int componentCount() {
    return components.size();
  }
}
