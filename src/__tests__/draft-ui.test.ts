import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { DraftUi } from "../infrastructure/draft-ui";

describe("DraftUi", () => {
  const mockWindow = vi.mocked(vscode.window);
  const mockCommands = vi.mocked(vscode.commands);
  // The mock records calls against the first overload, which takes MessageItems.
  const answer = (label: string | undefined) => label as unknown as vscode.MessageItem | undefined;
  let ui: DraftUi;

  beforeEach(() => {
    vi.clearAllMocks();
    ui = new DraftUi();
  });

  describe("confirmReplace", () => {
    it("asks in a non-modal notification that names the repository and the draft", async () => {
      mockWindow.showInformationMessage.mockResolvedValueOnce(undefined);

      await ui.confirmReplace("/work/my-repo", "feat: theirs");

      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        'AI Commit: a commit message draft arrived for my-repo, but the message box already has text. Replace it with "feat: theirs"?',
        "Replace",
        "Keep Current"
      );
    });

    it("is true when the user picks Replace", async () => {
      mockWindow.showInformationMessage.mockResolvedValueOnce(answer("Replace"));

      await expect(ui.confirmReplace("/repo", "feat: a")).resolves.toBe(true);
    });

    it("is false when the user picks Keep Current", async () => {
      mockWindow.showInformationMessage.mockResolvedValueOnce(answer("Keep Current"));

      await expect(ui.confirmReplace("/repo", "feat: a")).resolves.toBe(false);
    });

    it("is false when the notification is dismissed", async () => {
      mockWindow.showInformationMessage.mockResolvedValueOnce(answer(undefined));

      await expect(ui.confirmReplace("/repo", "feat: a")).resolves.toBe(false);
    });
  });

  describe("revealSourceControl", () => {
    it("shows the Source Control view while preserving focus", () => {
      ui.revealSourceControl();

      expect(mockCommands.executeCommand).toHaveBeenCalledTimes(1);
      expect(mockCommands.executeCommand).toHaveBeenCalledWith("workbench.scm.focus", {
        preserveFocus: true,
      });
    });

    it("does not fail when the command is rejected", async () => {
      mockCommands.executeCommand.mockRejectedValueOnce(new Error("command not found"));

      expect(() => ui.revealSourceControl()).not.toThrow();
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  });
});
