import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClockOutReportDialog } from "../ClockOutReportDialog";

describe("ClockOutReportDialog", () => {
  it("names the task and shows the local-AI warning only when Grok is off", () => {
    const { rerender } = render(
      <ClockOutReportDialog
        taskTitle="Write the devlog entry"
        grok4Enabled={false}
        onAiWrite={vi.fn()}
        onManualWrite={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByText("Clocked out of Write the devlog entry")).toBeInTheDocument();
    expect(screen.getByText(/Local AI may take a few seconds/)).toBeInTheDocument();

    rerender(
      <ClockOutReportDialog
        taskTitle="Write the devlog entry"
        grok4Enabled={true}
        onAiWrite={vi.fn()}
        onManualWrite={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Local AI may take a few seconds/)).not.toBeInTheDocument();
  });

  it("AI writes it passes along whatever brief text was typed", async () => {
    const user = userEvent.setup();
    const onAiWrite = vi.fn();
    render(
      <ClockOutReportDialog
        taskTitle="Write the devlog entry"
        grok4Enabled={false}
        onAiWrite={onAiWrite}
        onManualWrite={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/In a few words/), "Fixed the shadow clipping bug");
    await user.click(screen.getByRole("button", { name: "AI writes it" }));

    expect(onAiWrite).toHaveBeenCalledWith("Fixed the shadow clipping bug");
  });

  it("AI writes it works with no brief typed at all", async () => {
    const user = userEvent.setup();
    const onAiWrite = vi.fn();
    render(
      <ClockOutReportDialog
        taskTitle="Write the devlog entry"
        grok4Enabled={true}
        onAiWrite={onAiWrite}
        onManualWrite={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "AI writes it" }));

    expect(onAiWrite).toHaveBeenCalledWith("");
  });

  it("I'll write it and Skip for now call their own handlers", async () => {
    const user = userEvent.setup();
    const onManualWrite = vi.fn();
    const onSkip = vi.fn();
    render(
      <ClockOutReportDialog
        taskTitle="Write the devlog entry"
        grok4Enabled={true}
        onAiWrite={vi.fn()}
        onManualWrite={onManualWrite}
        onSkip={onSkip}
      />,
    );

    await user.click(screen.getByRole("button", { name: "I'll write it" }));
    expect(onManualWrite).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("Skip for now"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
