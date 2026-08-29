import * as vscode from "vscode";
import { execFile } from "child_process";
import {
  IGitRepository,
  IGitService,
  SetCommitMessageOptions,
} from "../core/ports";

interface GitExtensionAPI {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
}

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: {
    indexChanges: readonly { uri: vscode.Uri }[];
  };
}

export class GitService implements IGitService {
  async getActiveRepository(): Promise<IGitRepository> {
    const git = await this.getGitAPI();
    const repo = await this.findActiveRepository(git);
    return {
      rootPath: repo.rootUri.fsPath,
      setCommitMessage(message: string, options?: SetCommitMessageOptions) {
        repo.inputBox.value = message;
        if (options?.focusInput === false) {
          return;
        }
        // cursorTop applies to whatever holds focus, so it must wait for the
        // SCM box to actually have it — otherwise it scrolls the user's file.
        void vscode.commands
          .executeCommand("workbench.scm.focus")
          .then(() => vscode.commands.executeCommand("cursorTop"));
      },
    };
  }

  getStagedDiff(repoRoot: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        ["diff", "--staged"],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`git diff failed: ${stderr || error.message}`));
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  private async getGitAPI(): Promise<GitAPI> {
    const gitExtension =
      vscode.extensions.getExtension<GitExtensionAPI>("vscode.git");
    if (!gitExtension) {
      throw new Error("Git extension not found. Please install the Git extension.");
    }
    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }
    return gitExtension.exports.getAPI(1);
  }

  private async findActiveRepository(git: GitAPI): Promise<Repository> {
    const repos = git.repositories;

    if (repos.length === 0) {
      throw new Error("No Git repositories found in the workspace.");
    }

    if (repos.length === 1) {
      return repos[0];
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeUri = activeEditor.document.uri;
      const match = repos.find((repo) =>
        activeUri.fsPath.startsWith(repo.rootUri.fsPath + "/") ||
        activeUri.fsPath === repo.rootUri.fsPath
      );
      if (match) {
        return match;
      }
    }

    const items = repos.map((repo) => ({
      label: repo.rootUri.fsPath,
      repo,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a repository",
    });
    if (!picked) {
      throw new Error("No repository selected.");
    }
    return picked.repo;
  }
}
