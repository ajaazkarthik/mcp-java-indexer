import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve('large-java-project');
const srcRoot = path.join(projectRoot, 'src', 'main', 'java');
const packageCount = 80; // 80 packages
const classesPerPackage = 150; // 150 classes per package => 12,000 component classes
const packagePrefix = 'com.largeproj';

function pad(num, size = 3) {
  return String(num).padStart(size, '0');
}

function writeFileSync(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function packageDir(pkg) {
  return path.join(srcRoot, ...pkg.split('.'));
}

function ensureProjectRoot() {
  if (fs.existsSync(projectRoot)) {
    console.log(`Large project already exists at ${projectRoot}. Delete it first if you want to regenerate.`);
    process.exit(0);
  }

  fs.mkdirSync(srcRoot, { recursive: true });
}

function generatePom() {
  const pom = `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.largeproj</groupId>\n  <artifactId>large-java-project</artifactId>\n  <version>1.0.0</version>\n  <packaging>jar</packaging>\n  <name>Large Java Project</name>\n  <description>Synthetic project with 10k+ Java files for MCP stress testing</description>\n  <properties>\n    <maven.compiler.source>17</maven.compiler.source>\n    <maven.compiler.target>17</maven.compiler.target>\n  </properties>\n</project>`;

  writeFileSync(path.join(projectRoot, 'pom.xml'), pom);
}

function generateCoreClasses() {
  const corePackage = `${packagePrefix}.core`;
  const coreDir = packageDir(corePackage);

  const baseComponent = `package ${corePackage};\n\nimport java.util.Objects;\n\npublic abstract class BaseComponent {\n  private final int componentId;\n  private final String packageHint;\n\n  protected BaseComponent(int componentId, String packageHint) {\n    this.componentId = componentId;\n    this.packageHint = packageHint;\n  }\n\n  public int getComponentId() {\n    return componentId;\n  }\n\n  public String getPackageHint() {\n    return packageHint;\n  }\n\n  public abstract String process(String payload, ComponentContext ctx);\n\n  @Override\n  public String toString() {\n    return getPackageHint() + "#" + componentId;\n  }\n\n  protected String normalizePayload(String payload) {\n    return Objects.requireNonNullElse(payload, "").trim();\n  }\n}\n`;

  const componentContext = `package ${corePackage};\n\nimport java.util.Map;\n\npublic interface ComponentContext {\n  void record(String componentName, int size);\n  Map<String, Integer> snapshot();\n}\n`;

  const componentContextImpl = `package ${corePackage};\n\nimport java.util.Collections;\nimport java.util.Map;\nimport java.util.concurrent.ConcurrentHashMap;\n\npublic class ComponentContextImpl implements ComponentContext {\n  private final ConcurrentHashMap<String, Integer> metrics = new ConcurrentHashMap<>();\n\n  @Override\n  public void record(String componentName, int size) {\n    metrics.merge(componentName, size, Integer::sum);\n  }\n\n  @Override\n  public Map<String, Integer> snapshot() {\n    return Collections.unmodifiableMap(metrics);\n  }\n\n  public int getTotalRecorded() {\n    return metrics.values().stream().mapToInt(Integer::intValue).sum();\n  }\n}\n`;

  const telemetryReport = `package ${corePackage};\n\nimport java.time.Instant;\nimport java.util.Map;\n\npublic record TelemetryReport(String packageName, String payload, Instant timestamp, Map<String, Integer> metrics) {\n  public String summary() {\n    return packageName + "@" + timestamp + " -> " + metrics.size() + " metrics";\n  }\n}\n`;

  const telemetryService = `package ${corePackage};\n\npublic interface TelemetryService {\n  String streamMetrics(ComponentContext ctx);\n  String analyticsReport(ComponentContext ctx);\n}\n`;

  writeFileSync(path.join(coreDir, 'BaseComponent.java'), baseComponent);
  writeFileSync(path.join(coreDir, 'ComponentContext.java'), componentContext);
  writeFileSync(path.join(coreDir, 'ComponentContextImpl.java'), componentContextImpl);
  writeFileSync(path.join(coreDir, 'TelemetryReport.java'), telemetryReport);
  writeFileSync(path.join(coreDir, 'TelemetryService.java'), telemetryService);
}

function buildComponentClass(pkgName, packageLabel, classIndex) {
  const className = `Component${packageLabel}_${pad(classIndex)}`;
  const neighborName = `Component${packageLabel}_${pad((classIndex + 1) % classesPerPackage)}`;
  return `package ${pkgName};\n\nimport ${packagePrefix}.core.BaseComponent;\nimport ${packagePrefix}.core.ComponentContext;\n\n/**\n * Synthetic component ${className} keeps telemetry keywords alive for semantic search coverage.\n */\npublic class ${className} extends BaseComponent {\n\n  public ${className}(int id) {\n    super(id, "${pkgName}");\n  }\n\n  @Override\n  public String process(String payload, ComponentContext ctx) {\n    String result = normalizePayload(payload) + "|${packageLabel}-" + "${pad(classIndex)}";\n    ctx.record("${pkgName}.${className}", result.length());\n    return result;\n  }\n\n  public String describeTopology() {\n    return "metrics aggregator component ${className} handling telemetry fan-out";\n  }\n\n  public ${neighborName} handoff(${neighborName} neighbor) {\n    return neighbor;\n  }\n}\n`;
}

function buildPackageService(pkgName, packageLabel) {
  const serviceName = `PackageService${packageLabel}`;
  const componentPrefix = `Component${packageLabel}_`;
  return `package ${pkgName};\n\nimport java.util.ArrayList;\nimport java.util.List;\nimport ${packagePrefix}.core.BaseComponent;\nimport ${packagePrefix}.core.ComponentContext;\nimport ${packagePrefix}.core.ComponentContextImpl;\nimport ${packagePrefix}.core.TelemetryService;\n\n/**\n * PackageService ${packageLabel} orchestrates telemetry fan-out and metrics aggregation for semantic stress tests.\n */\npublic class ${serviceName} implements TelemetryService {\n  private final List<BaseComponent> components = new ArrayList<>();\n\n  public ${serviceName}() {\n    components.add(new ${componentPrefix}000(0));\n    components.add(new ${componentPrefix}001(1));\n    components.add(new ${componentPrefix}002(2));\n  }\n\n  @Override\n  public String streamMetrics(ComponentContext ctx) {\n    String payload = "pkg-${packageLabel}";\n    for (BaseComponent component : components) {\n      payload = component.process(payload, ctx);\n    }\n    return payload;\n  }\n\n  @Override\n  public String analyticsReport(ComponentContext ctx) {\n    ComponentContextImpl impl = ctx instanceof ComponentContextImpl ? (ComponentContextImpl) ctx : new ComponentContextImpl();\n    String metrics = streamMetrics(impl);\n    return "telemetry metrics aggregator ${packageLabel} -> " + metrics;\n  }\n\n  public int componentCount() {\n    return components.size();\n  }\n}\n`;
}

function generatePackage(index) {
  const packageLabel = pad(index);
  const pkgName = `${packagePrefix}.pkg${packageLabel}`;
  const pkgDir = packageDir(pkgName);

  for (let classIndex = 0; classIndex < classesPerPackage; classIndex++) {
    const componentContent = buildComponentClass(pkgName, packageLabel, classIndex);
    writeFileSync(path.join(pkgDir, `Component${packageLabel}_${pad(classIndex)}.java`), componentContent);
  }

  const serviceContent = buildPackageService(pkgName, packageLabel);
  writeFileSync(path.join(pkgDir, `PackageService${packageLabel}.java`), serviceContent);

  return `${pkgName}.PackageService${packageLabel}`;
}

function generateMegaApplication(serviceFqns) {
  const appPackage = `${packagePrefix}.app`;
  const appDir = packageDir(appPackage);
  const imports = serviceFqns.map((fqn) => `import ${fqn};`).join('\n');
  const serviceInstantiations = serviceFqns
    .map((fqn) => {
      const simple = fqn.substring(fqn.lastIndexOf('.') + 1);
      return `    services.add(new ${simple}());`;
    })
    .join('\n');

  const megaApplication = `package ${appPackage};\n\nimport java.util.ArrayList;\nimport java.util.List;\nimport ${packagePrefix}.core.ComponentContext;\nimport ${packagePrefix}.core.ComponentContextImpl;\nimport ${packagePrefix}.core.TelemetryService;\n${imports}\n\npublic class MegaApplication {\n  private final ComponentContext context = new ComponentContextImpl();\n  private final List<TelemetryService> services = new ArrayList<>();\n\n  public MegaApplication() {\n${serviceInstantiations}\n  }\n\n  public String hydrateWorld() {\n    StringBuilder builder = new StringBuilder("mega");\n    for (TelemetryService service : services) {\n      builder.append('|').append(service.streamMetrics(context));\n    }\n    return builder.toString();\n  }\n\n  public String diagnostics() {\n    return "services=" + services.size() + ", metrics=" + context.snapshot().size();\n  }\n\n  public void warmup() {\n    for (TelemetryService service : services) {\n      service.analyticsReport(context);\n    }\n  }\n}\n`;

  writeFileSync(path.join(appDir, 'MegaApplication.java'), megaApplication);
}

function main() {
  ensureProjectRoot();
  console.time('generate-large-project');
  generatePom();
  generateCoreClasses();

  const serviceFqns = [];
  for (let i = 0; i < packageCount; i++) {
    if (i % 5 === 0) {
      console.log(`Generating package ${i + 1} / ${packageCount}`);
    }
    serviceFqns.push(generatePackage(i));
  }

  generateMegaApplication(serviceFqns);
  console.timeEnd('generate-large-project');

  const totalFiles = packageCount * classesPerPackage + packageCount + 5 + 1; // components + services + core files + mega app
  console.log(`Created synthetic Maven project at ${projectRoot}`);
  console.log(`Total Java files: ${totalFiles}`);
}

main();
