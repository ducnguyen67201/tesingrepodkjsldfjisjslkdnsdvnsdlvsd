import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptVariableInjector } from "../prompt-variable-injector";
import type { PromptTemplate, PromptVariable } from "@cognobserve/api/schemas";

// ============================================================
// Test Data Fixtures
// ============================================================

const TEXT_TEMPLATE_NO_VARS: PromptTemplate = {
  type: "text",
  text: "Hello, this is a static prompt with no variables.",
};

const TEXT_TEMPLATE_SINGLE_VAR: PromptTemplate = {
  type: "text",
  text: "Hello, {{name}}! Welcome to the app.",
};

const TEXT_TEMPLATE_MULTIPLE_VARS: PromptTemplate = {
  type: "text",
  text: "Hello {{name}}, you are a {{role}} from {{company}}.",
};

const CHAT_TEMPLATE_WITH_VARS: PromptTemplate = {
  type: "chat",
  messages: [
    { role: "system", content: "You are a {{persona}} assistant." },
    { role: "user", content: "Tell me about {{topic}}." },
  ],
};

const VARIABLES_WITH_METADATA: PromptVariable[] = [
  {
    name: "name",
    required: true,
    description: "User's display name",
  },
  {
    name: "role",
    required: false,
    default: "member",
    description: "User role in the organization",
  },
  {
    name: "company",
    required: true,
  },
];

// ============================================================
// Component Rendering Tests
// ============================================================

describe("PromptVariableInjector", () => {
  describe("rendering", () => {
    it("should return null when template has no variables", () => {
      const { container } = render(
        <PromptVariableInjector content={TEXT_TEMPLATE_NO_VARS} />
      );

      expect(container.firstChild).toBeNull();
    });

    it("should render input fields for each variable", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_MULTIPLE_VARS} />);

      expect(screen.getByLabelText("name")).toBeInTheDocument();
      expect(screen.getByLabelText("role")).toBeInTheDocument();
      expect(screen.getByLabelText("company")).toBeInTheDocument();
    });

    it("should render the card title and description", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);

      expect(screen.getByText("Dynamic Variables")).toBeInTheDocument();
      expect(
        screen.getByText("Inject values to preview the compiled prompt.")
      ).toBeInTheDocument();
    });

    it("should render compiled preview section", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);

      expect(screen.getByText("Compiled Preview")).toBeInTheDocument();
    });
  });

  describe("variable metadata", () => {
    it("should show required badge for required variables", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_MULTIPLE_VARS}
          variables={VARIABLES_WITH_METADATA}
        />
      );

      // Find required badges
      const requiredBadges = screen.getAllByText("required");
      expect(requiredBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("should show default badge for variables with defaults", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_MULTIPLE_VARS}
          variables={VARIABLES_WITH_METADATA}
        />
      );

      expect(screen.getByText("default")).toBeInTheDocument();
    });

    it("should apply default values to inputs", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_MULTIPLE_VARS}
          variables={VARIABLES_WITH_METADATA}
        />
      );

      const roleInput = screen.getByLabelText("role") as HTMLInputElement;
      expect(roleInput.value).toBe("member");
    });

    it("should show description as help text", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_MULTIPLE_VARS}
          variables={VARIABLES_WITH_METADATA}
        />
      );

      expect(screen.getByText("User's display name")).toBeInTheDocument();
      expect(
        screen.getByText("User role in the organization")
      ).toBeInTheDocument();
    });
  });

  describe("chat templates", () => {
    it("should extract variables from all chat messages", () => {
      render(<PromptVariableInjector content={CHAT_TEMPLATE_WITH_VARS} />);

      expect(screen.getByLabelText("persona")).toBeInTheDocument();
      expect(screen.getByLabelText("topic")).toBeInTheDocument();
    });

    it("should show formatted chat preview", () => {
      render(<PromptVariableInjector content={CHAT_TEMPLATE_WITH_VARS} />);

      // Preview should show role labels
      expect(screen.getByText(/\[system\]/)).toBeInTheDocument();
      expect(screen.getByText(/\[user\]/)).toBeInTheDocument();
    });
  });

  describe("input handling", () => {
    it("should update preview when input changes", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);

      const input = screen.getByLabelText("name") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Alice" } });

      // Preview should update
      expect(
        screen.getByText("Hello, Alice! Welcome to the app.")
      ).toBeInTheDocument();
    });

    it("should keep placeholder when value is empty", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);

      // Initially, placeholder should be preserved in preview
      expect(
        screen.getByText("Hello, {{name}}! Welcome to the app.")
      ).toBeInTheDocument();
    });

    it("should handle multiple input updates", () => {
      render(<PromptVariableInjector content={TEXT_TEMPLATE_MULTIPLE_VARS} />);

      const nameInput = screen.getByLabelText("name") as HTMLInputElement;
      const roleInput = screen.getByLabelText("role") as HTMLInputElement;
      const companyInput = screen.getByLabelText("company") as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: "Bob" } });
      fireEvent.change(roleInput, { target: { value: "engineer" } });
      fireEvent.change(companyInput, { target: { value: "Acme Corp" } });

      expect(
        screen.getByText("Hello Bob, you are a engineer from Acme Corp.")
      ).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle duplicate variable names", () => {
      const template: PromptTemplate = {
        type: "text",
        text: "{{name}} says hello. {{name}} is here.",
      };

      render(<PromptVariableInjector content={template} />);

      // Should only render one input for 'name'
      const inputs = screen.getAllByLabelText("name");
      expect(inputs).toHaveLength(1);
    });

    it("should handle empty variables array", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_SINGLE_VAR}
          variables={[]}
        />
      );

      // Should still render input based on extracted variable
      expect(screen.getByLabelText("name")).toBeInTheDocument();
    });

    it("should handle null variables", () => {
      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_SINGLE_VAR}
          variables={null}
        />
      );

      // Should still render input based on extracted variable
      expect(screen.getByLabelText("name")).toBeInTheDocument();
    });

    it("should use description as placeholder when no default", () => {
      const variables: PromptVariable[] = [
        {
          name: "name",
          required: true,
          description: "Enter user name",
        },
      ];

      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_SINGLE_VAR}
          variables={variables}
        />
      );

      const input = screen.getByLabelText("name") as HTMLInputElement;
      expect(input.placeholder).toBe("Enter user name");
    });

    it("should fall back to default placeholder when no description", () => {
      const variables: PromptVariable[] = [
        {
          name: "name",
          required: true,
        },
      ];

      render(
        <PromptVariableInjector
          content={TEXT_TEMPLATE_SINGLE_VAR}
          variables={variables}
        />
      );

      const input = screen.getByLabelText("name") as HTMLInputElement;
      expect(input.placeholder).toBe("Enter name...");
    });
  });
});

// ============================================================
// Utility Function Tests (extractVariables, compileTemplate)
// ============================================================

describe("extractVariables utility", () => {
  // We'll test the logic by observing component behavior
  // since the function isn't exported directly

  it("should extract single variable from text", () => {
    render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);
    expect(screen.getByLabelText("name")).toBeInTheDocument();
  });

  it("should extract multiple unique variables", () => {
    render(<PromptVariableInjector content={TEXT_TEMPLATE_MULTIPLE_VARS} />);

    const labels = ["name", "role", "company"];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });
  });

  it("should extract from chat message content", () => {
    render(<PromptVariableInjector content={CHAT_TEMPLATE_WITH_VARS} />);

    expect(screen.getByLabelText("persona")).toBeInTheDocument();
    expect(screen.getByLabelText("topic")).toBeInTheDocument();
  });

  it("should not extract non-matching patterns", () => {
    const template: PromptTemplate = {
      type: "text",
      text: "No variables here. Just {single} or {{ spaced }} braces.",
    };

    const { container } = render(
      <PromptVariableInjector content={template} />
    );

    // Should return null (no variables found)
    expect(container.firstChild).toBeNull();
  });
});

describe("compileTemplate utility", () => {
  it("should replace variables with values in text template", () => {
    render(<PromptVariableInjector content={TEXT_TEMPLATE_SINGLE_VAR} />);

    const input = screen.getByLabelText("name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "World" } });

    expect(
      screen.getByText("Hello, World! Welcome to the app.")
    ).toBeInTheDocument();
  });

  it("should replace variables in chat messages", () => {
    render(<PromptVariableInjector content={CHAT_TEMPLATE_WITH_VARS} />);

    const personaInput = screen.getByLabelText("persona") as HTMLInputElement;
    const topicInput = screen.getByLabelText("topic") as HTMLInputElement;

    fireEvent.change(personaInput, { target: { value: "helpful" } });
    fireEvent.change(topicInput, { target: { value: "TypeScript" } });

    // Check preview contains replaced values
    const preview = screen.getByText(/Compiled Preview/i)
      .parentElement?.querySelector("pre");
    expect(preview?.textContent).toContain("You are a helpful assistant.");
    expect(preview?.textContent).toContain("Tell me about TypeScript.");
  });

  it("should preserve unmatched placeholders", () => {
    render(<PromptVariableInjector content={TEXT_TEMPLATE_MULTIPLE_VARS} />);

    // Only fill in one variable
    const nameInput = screen.getByLabelText("name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Alice" } });

    // Other placeholders should remain
    const preview = screen.getByText(/Compiled Preview/i)
      .parentElement?.querySelector("pre");
    expect(preview?.textContent).toContain("Hello Alice");
    expect(preview?.textContent).toContain("{{role}}");
    expect(preview?.textContent).toContain("{{company}}");
  });
});
