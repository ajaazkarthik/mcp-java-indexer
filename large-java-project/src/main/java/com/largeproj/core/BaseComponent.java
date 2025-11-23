package com.largeproj.core;

import java.util.Objects;

public abstract class BaseComponent {
  private final int componentId;
  private final String packageHint;

  protected BaseComponent(int componentId, String packageHint) {
    this.componentId = componentId;
    this.packageHint = packageHint;
  }

  public int getComponentId() {
    return componentId;
  }

  public String getPackageHint() {
    return packageHint;
  }

  public abstract String process(String payload, ComponentContext ctx);

  @Override
  public String toString() {
    return getPackageHint() + "#" + componentId;
  }

  protected String normalizePayload(String payload) {
    return Objects.requireNonNullElse(payload, "").trim();
  }
}
