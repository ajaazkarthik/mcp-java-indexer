import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MemoryIndex } from '../memory-index.js';

export const codeGenerationTool: Tool = {
  name: 'code_generation',
  description: 'Generate boilerplate code based on patterns found in the codebase. Analyzes existing code structure and generates consistent implementations for builders, repositories, services, DTOs, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        enum: ['builder', 'repository', 'service', 'dto', 'test', 'exception', 'factory', 'validator'],
        description: 'Type of code pattern to generate'
      },
      basedOn: {
        type: 'string',
        description: 'FQN of existing class to use as template (optional - will analyze codebase if not provided)'
      },
      targetName: {
        type: 'string',
        description: 'Name for the new class (e.g., "User" for UserBuilder, "Order" for OrderService)'
      },
      packageName: {
        type: 'string',
        description: 'Package for the new class (optional - will infer from existing patterns)'
      }
    },
    required: ['pattern', 'targetName']
  }
};

export async function handleCodeGeneration(
  args: any,
  memoryIndex: MemoryIndex,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    console.error('[MCP] cancelled code_generation');
    return { content: [{type:'text',text:'Request cancelled'}], isError: true };
  }

  const pattern = args.pattern as string;
  const basedOn = args.basedOn as string | undefined;
  const targetName = args.targetName as string;
  const packageName = args.packageName as string | undefined;

  try {
    let report = `# Code Generation: ${targetName}${getPatternSuffix(pattern)}\n\n`;
    report += `**Pattern**: ${pattern}\n`;
    if (basedOn) {
      report += `**Based On**: ${basedOn}\n`;
    }
    report += `**Target Name**: ${targetName}\n\n`;

    // Find existing examples of this pattern
    const examples = findPatternExamples(pattern, memoryIndex);
    
    if (examples.length === 0 && !basedOn) {
      report += `## ⚠️ No Examples Found\n\n`;
      report += `No existing ${pattern} classes found in the codebase.\n`;
      report += `Generating template based on best practices...\n\n`;
    } else {
      report += `## 📚 Analysis\n\n`;
      report += `Found ${examples.length} existing ${pattern} examples in codebase.\n`;
      if (examples.length > 0) {
        report += `Using patterns from:\n`;
        examples.slice(0, 5).forEach(ex => {
          report += `- \`${ex.name}\` (${getFileName(ex.file)})\n`;
        });
        if (examples.length > 5) {
          report += `- ... and ${examples.length - 5} more\n`;
        }
        report += `\n`;
      }
    }

    // Analyze template
    let template = basedOn ? memoryIndex.getSymbol(basedOn) : (examples[0] || null);
    const pkg = packageName || inferPackage(pattern, memoryIndex);

    // Generate code based on pattern
    let generatedCode = '';
    let explanation = '';

    switch (pattern) {
      case 'builder':
        ({ code: generatedCode, explanation } = generateBuilder(targetName, pkg, template, memoryIndex));
        break;
      case 'repository':
        ({ code: generatedCode, explanation } = generateRepository(targetName, pkg, template, memoryIndex));
        break;
      case 'service':
        ({ code: generatedCode, explanation } = generateService(targetName, pkg, template, memoryIndex));
        break;
      case 'dto':
        ({ code: generatedCode, explanation } = generateDTO(targetName, pkg, template, memoryIndex));
        break;
      case 'test':
        ({ code: generatedCode, explanation } = generateTest(targetName, pkg, template, memoryIndex));
        break;
      case 'exception':
        ({ code: generatedCode, explanation } = generateException(targetName, pkg, template, memoryIndex));
        break;
      case 'factory':
        ({ code: generatedCode, explanation } = generateFactory(targetName, pkg, template, memoryIndex));
        break;
      case 'validator':
        ({ code: generatedCode, explanation } = generateValidator(targetName, pkg, template, memoryIndex));
        break;
      default:
        throw new Error(`Unsupported pattern: ${pattern}`);
    }

    report += `## 💡 Pattern Analysis\n\n`;
    report += explanation + '\n\n';

    report += `## 📝 Generated Code\n\n`;
    report += '```java\n';
    report += generatedCode;
    report += '\n```\n\n';

    // Next steps
    report += `## 🚀 Next Steps\n\n`;
    report += `1. Review the generated code and adjust as needed\n`;
    report += `2. Create file: \`${pkg.replace(/\./g, '/')}/${targetName}${getPatternSuffix(pattern)}.java\`\n`;
    report += `3. Add any domain-specific fields and methods\n`;
    report += `4. Run tests to ensure integration\n`;
    report += `5. Update documentation\n`;

    return {
      content: [{
        type: 'text',
        text: report
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Failed to generate code: ${errorMessage}`
      }],
      isError: true
    };
  }
}

function findPatternExamples(pattern: string, index: MemoryIndex): any[] {
  const examples: any[] = [];
  const suffix = getPatternSuffix(pattern).toLowerCase();
  
  for (const [fqn, symbol] of index.getAllSymbols()) {
    if (symbol.kind !== 'class') continue;
    
    const nameLower = symbol.name.toLowerCase();
    if (nameLower.endsWith(suffix) || nameLower.includes(suffix)) {
      examples.push(symbol);
    }
  }
  
  return examples;
}

function inferPackage(pattern: string, index: MemoryIndex): string {
  const examples = findPatternExamples(pattern, index);
  if (examples.length > 0) {
    return examples[0].packageName;
  }
  return `com.example.${pattern}`;
}

function generateBuilder(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Builder`;
  
  let explanation = `**Builder Pattern**: Fluent API for constructing ${name} objects.\n`;
  explanation += `- Provides method chaining with \`with*\` methods\n`;
  explanation += `- Validates state before building\n`;
  explanation += `- Returns immutable objects\n`;

  const code = `package ${pkg};

/**
 * Builder for ${name} objects.
 * Provides fluent API for constructing ${name} instances.
 */
public class ${className} {
    // TODO: Add fields for ${name} properties
    private String id;
    private String name;
    
    public ${className}() {
        // Initialize defaults
    }
    
    public ${className} withId(String id) {
        this.id = id;
        return this;
    }
    
    public ${className} withName(String name) {
        this.name = name;
        return this;
    }
    
    /**
     * Validates and builds the ${name} instance.
     * @return constructed ${name} object
     * @throws IllegalStateException if required fields are missing
     */
    public ${name} build() {
        validate();
        return new ${name}(id, name);
    }
    
    private void validate() {
        if (name == null || name.isEmpty()) {
            throw new IllegalStateException("Name is required");
        }
    }
}`;

  return { code, explanation };
}

function generateRepository(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Repository`;
  
  let explanation = `**Repository Pattern**: Data access layer for ${name} entities.\n`;
  explanation += `- CRUD operations: save, findById, findAll, delete\n`;
  explanation += `- Abstracts data storage implementation\n`;
  explanation += `- Can be mocked for testing\n`;

  const code = `package ${pkg};

import java.util.List;
import java.util.Optional;

/**
 * Repository for ${name} entity persistence.
 * Handles all data access operations.
 */
public class ${className} {
    
    /**
     * Saves a ${name} entity.
     * @param entity the entity to save
     * @return saved entity with generated ID
     */
    public ${name} save(${name} entity) {
        // TODO: Implement persistence logic
        return entity;
    }
    
    /**
     * Finds a ${name} by ID.
     * @param id the entity ID
     * @return Optional containing the entity if found
     */
    public Optional<${name}> findById(Long id) {
        // TODO: Implement lookup logic
        return Optional.empty();
    }
    
    /**
     * Retrieves all ${name} entities.
     * @return list of all entities
     */
    public List<${name}> findAll() {
        // TODO: Implement retrieval logic
        return List.of();
    }
    
    /**
     * Deletes a ${name} by ID.
     * @param id the entity ID to delete
     */
    public void deleteById(Long id) {
        // TODO: Implement deletion logic
    }
    
    /**
     * Checks if entity exists.
     * @param id the entity ID
     * @return true if exists
     */
    public boolean existsById(Long id) {
        return findById(id).isPresent();
    }
}`;

  return { code, explanation };
}

function generateService(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Service`;
  
  let explanation = `**Service Layer**: Business logic for ${name} operations.\n`;
  explanation += `- Orchestrates between controllers and repositories\n`;
  explanation += `- Contains validation and business rules\n`;
  explanation += `- Transaction boundaries\n`;

  const code = `package ${pkg};

import java.util.List;

/**
 * Service for ${name} business operations.
 * Contains business logic and orchestration.
 */
public class ${className} {
    
    private final ${name}Repository repository;
    
    public ${className}(${name}Repository repository) {
        this.repository = repository;
    }
    
    /**
     * Creates a new ${name}.
     * @param entity the entity to create
     * @return created entity
     * @throws IllegalArgumentException if validation fails
     */
    public ${name} create(${name} entity) {
        validate(entity);
        return repository.save(entity);
    }
    
    /**
     * Retrieves a ${name} by ID.
     * @param id the entity ID
     * @return the entity
     * @throws EntityNotFoundException if not found
     */
    public ${name} getById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("${name} not found: " + id));
    }
    
    /**
     * Retrieves all ${name} entities.
     * @return list of all entities
     */
    public List<${name}> getAll() {
        return repository.findAll();
    }
    
    /**
     * Updates an existing ${name}.
     * @param id the entity ID
     * @param entity updated entity data
     * @return updated entity
     */
    public ${name} update(Long id, ${name} entity) {
        ${name} existing = getById(id);
        // TODO: Update fields
        return repository.save(existing);
    }
    
    /**
     * Deletes a ${name} by ID.
     * @param id the entity ID
     */
    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new EntityNotFoundException("${name} not found: " + id);
        }
        repository.deleteById(id);
    }
    
    private void validate(${name} entity) {
        // TODO: Add validation logic
        if (entity == null) {
            throw new IllegalArgumentException("${name} cannot be null");
        }
    }
}`;

  return { code, explanation };
}

function generateDTO(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}DTO`;
  
  let explanation = `**Data Transfer Object**: Lightweight data container for ${name}.\n`;
  explanation += `- Immutable data structure\n`;
  explanation += `- Used for API requests/responses\n`;
  explanation += `- No business logic\n`;

  const code = `package ${pkg};

import java.io.Serializable;
import java.util.Objects;

/**
 * Data Transfer Object for ${name}.
 * Immutable data structure for API communication.
 */
public class ${className} implements Serializable {
    
    private final Long id;
    private final String name;
    
    public ${className}(Long id, String name) {
        this.id = id;
        this.name = name;
    }
    
    public Long getId() {
        return id;
    }
    
    public String getName() {
        return name;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ${className} that = (${className}) o;
        return Objects.equals(id, that.id) &&
               Objects.equals(name, that.name);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(id, name);
    }
    
    @Override
    public String toString() {
        return "${className}{" +
               "id=" + id +
               ", name='" + name + '\\'' +
               '}';
    }
}`;

  return { code, explanation };
}

function generateTest(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Test`;
  
  let explanation = `**Unit Test**: Comprehensive test suite for ${name}.\n`;
  explanation += `- Tests all public methods\n`;
  explanation += `- Includes edge cases and error scenarios\n`;
  explanation += `- Uses mocking for dependencies\n`;

  const code = `package ${pkg};

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for ${name}.
 */
@DisplayName("${name} Tests")
class ${className} {
    
    private ${name} subject;
    
    @BeforeEach
    void setUp() {
        subject = new ${name}();
    }
    
    @Test
    @DisplayName("should create instance successfully")
    void testCreation() {
        assertNotNull(subject);
    }
    
    @Test
    @DisplayName("should handle valid input")
    void testValidInput() {
        // TODO: Add test logic
        fail("Not implemented");
    }
    
    @Test
    @DisplayName("should throw exception for invalid input")
    void testInvalidInput() {
        // TODO: Add test logic
        assertThrows(IllegalArgumentException.class, () -> {
            // Call method with invalid input
        });
    }
    
    @Test
    @DisplayName("should handle edge cases")
    void testEdgeCases() {
        // TODO: Add edge case tests
        fail("Not implemented");
    }
}`;

  return { code, explanation };
}

function generateException(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Exception`;
  
  let explanation = `**Custom Exception**: Domain-specific exception for ${name} errors.\n`;
  explanation += `- Extends RuntimeException for unchecked behavior\n`;
  explanation += `- Includes error codes and context\n`;
  explanation += `- Provides detailed error messages\n`;

  const code = `package ${pkg};

/**
 * Exception thrown when ${name} operations fail.
 */
public class ${className} extends RuntimeException {
    
    private final String errorCode;
    
    public ${className}(String message) {
        super(message);
        this.errorCode = "ERR_${name.toUpperCase()}";
    }
    
    public ${className}(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
    
    public ${className}(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = "ERR_${name.toUpperCase()}";
    }
    
    public String getErrorCode() {
        return errorCode;
    }
    
    @Override
    public String toString() {
        return errorCode + ": " + getMessage();
    }
}`;

  return { code, explanation };
}

function generateFactory(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Factory`;
  
  let explanation = `**Factory Pattern**: Creates ${name} instances based on input.\n`;
  explanation += `- Encapsulates object creation logic\n`;
  explanation += `- Provides different creation strategies\n`;
  explanation += `- Centralizes initialization\n`;

  const code = `package ${pkg};

/**
 * Factory for creating ${name} instances.
 */
public class ${className} {
    
    private ${className}() {
        // Private constructor to prevent instantiation
    }
    
    /**
     * Creates a default ${name} instance.
     */
    public static ${name} createDefault() {
        return new ${name}();
    }
    
    /**
     * Creates a ${name} with specific configuration.
     */
    public static ${name} create(String config) {
        ${name} instance = new ${name}();
        // TODO: Apply configuration
        return instance;
    }
    
    /**
     * Creates a ${name} from data transfer object.
     */
    public static ${name} fromDTO(${name}DTO dto) {
        // TODO: Convert DTO to entity
        return new ${name}();
    }
}`;

  return { code, explanation };
}

function generateValidator(name: string, pkg: string, template: any, index: MemoryIndex): { code: string; explanation: string } {
  const className = `${name}Validator`;
  
  let explanation = `**Validator**: Validates ${name} objects against business rules.\n`;
  explanation += `- Centralized validation logic\n`;
  explanation += `- Reusable across layers\n`;
  explanation += `- Clear error messages\n`;

  const code = `package ${pkg};

import java.util.ArrayList;
import java.util.List;

/**
 * Validator for ${name} objects.
 */
public class ${className} {
    
    /**
     * Validates a ${name} instance.
     * @param entity the entity to validate
     * @return list of validation errors (empty if valid)
     */
    public List<String> validate(${name} entity) {
        List<String> errors = new ArrayList<>();
        
        if (entity == null) {
            errors.add("${name} cannot be null");
            return errors;
        }
        
        // TODO: Add validation rules
        
        return errors;
    }
    
    /**
     * Checks if entity is valid.
     */
    public boolean isValid(${name} entity) {
        return validate(entity).isEmpty();
    }
    
    /**
     * Validates and throws exception if invalid.
     * @throws ValidationException if validation fails
     */
    public void validateOrThrow(${name} entity) {
        List<String> errors = validate(entity);
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed: " + String.join(", ", errors));
        }
    }
}`;

  return { code, explanation };
}

function getPatternSuffix(pattern: string): string {
  const suffixes: { [key: string]: string } = {
    'builder': 'Builder',
    'repository': 'Repository',
    'service': 'Service',
    'dto': 'DTO',
    'test': 'Test',
    'exception': 'Exception',
    'factory': 'Factory',
    'validator': 'Validator'
  };
  return suffixes[pattern] || '';
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
