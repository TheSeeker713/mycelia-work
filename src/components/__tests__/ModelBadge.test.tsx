import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelBadge } from "../ModelBadge";

describe("ModelBadge", () => {
  it("renders nothing when no model was recorded, so manual reports stay clean", () => {
    const { container } = render(<ModelBadge modelUsed={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the model and the backend that answered", () => {
    render(<ModelBadge modelUsed="xai/grok-4.5" backendUsed="openclaw" />);

    expect(screen.getByText(/Grok 4.5/)).toBeInTheDocument();
    expect(screen.getByText(/OpenClaw/)).toBeInTheDocument();
  });

  it("strips the provider prefix off a local model name", () => {
    render(<ModelBadge modelUsed="ollama/hermes3:8b" backendUsed="ollama" />);

    expect(screen.getByText(/hermes3:8b/)).toBeInTheDocument();
  });

  it("marks a fallback distinctly and says so on hover, rather than looking identical to a normal answer", () => {
    const { rerender } = render(<ModelBadge modelUsed="ollama/hermes3:8b" backendUsed="ollama" usedFallback />);
    const fallback = screen.getByTitle(/fallback/);
    expect(fallback.className).toContain("border-dashed");

    rerender(<ModelBadge modelUsed="xai/grok-4.5" backendUsed="openclaw" />);
    expect(screen.queryByTitle(/fallback/)).not.toBeInTheDocument();
  });

  it("still renders with no backend recorded, for rows written before that was tracked", () => {
    render(<ModelBadge modelUsed="xai/grok-4.5" backendUsed={null} />);

    expect(screen.getByText(/Grok 4.5/)).toBeInTheDocument();
    expect(screen.queryByText(/OpenClaw/)).not.toBeInTheDocument();
  });
});
