import * as vscode from "vscode";
import * as path from "path";
import { IDraftUi } from "../core/ports";

const REPLACE = "Replace";
const KEEP = "Keep Current";

export class DraftUi implements IDraftUi {
  async confirmReplace(repoRootPath: string, draftSubject: string): Promise<boolean> {
    // Not modal: a modal dialog would take focus from wherever the user is typing.
    const choice = await vscode.window.showInformationMessage(
      `AI Commit: a commit message draft arrived for ${path.basename(repoRootPath)}, but the message box already has text. Replace it with "${draftSubject}"?`,
      REPLACE,
      KEEP
    );
    return choice === REPLACE;
  }

  revealSourceControl(): void {
    // preserveFocus shows the view and leaves keyboard focus where it is.
    void vscode.commands
      .executeCommand("workbench.scm.focus", { preserveFocus: true })
      .then(undefined, () => undefined);
  }
}
