import * as vscode from "vscode";
import { execFile } from "child_process";
import * as path from "path";
import {
  Disposable,
  IGitRepository,
  IGitService,
  IOpenRepository,
  IRepositoryTracker,
  RepositoryListener,
  SetCommitMessageOptions,
} from "../core/ports";

interface GitExtensionAPI {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
  onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: {
    indexChanges: readonly { uri: vscode.Uri }[];
  };
}

function toGitRepository(repo: Repository): IGitRepository {
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

// Asked of git rather than read from the git extension's repository state,
// which is still empty for a moment after a repository opens.
function hasStagedChanges(repoRoot: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["diff", "--cached", "--quiet"],
      { cwd: repoRoot },
      // Exit code 1 means there are differences; anything else that fails is
      // treated as "nothing staged" so an unknown state never fills the box.
      (error) => resolve(error?.code === 1)
    );
  });
}

function resolveGitPath(repoRoot: string, name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["rev-parse", "--git-path", name],
      { cwd: repoRoot },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git rev-parse failed: ${stderr || error.message}`));
          return;
        }
        // Relative to the repository root in a normal clone, absolute in a
        // linked worktree.
        resolve(path.resolve(repoRoot, stdout.trim()));
      }
    );
  });
}

function toOpenRepository(repo: Repository): IOpenRepository {
  const rootPath = repo.rootUri.fsPath;
  return {
    ...toGitRepository(repo),
    getCommitMessage: () => repo.inputBox.value,
    hasStagedChanges: () => hasStagedChanges(rootPath),
    resolveGitPath: (name: string) => resolveGitPath(rootPath, name),
  };
}

export class GitService implements IGitService, IRepositoryTracker {
  async getActiveRepository(): Promise<IGitRepository> {
    const git = await this.getGitAPI();
    const repo = await this.findActiveRepository(git);
    return toGitRepository(repo);
  }

  trackRepositories(listener: RepositoryListener): Disposable {
    const subscriptions: vscode.Disposable[] = [];
    let disposed = false;

    void this.getGitAPI().then(
      (git) => {
        if (disposed) {
          return;
        }
        subscriptions.push(
          git.onDidOpenRepository((repo) =>
            listener.opened(toOpenRepository(repo))
          ),
          git.onDidCloseRepository((repo) =>
            listener.closed(repo.rootUri.fsPath)
          )
        );
        for (const repo of git.repositories) {
          listener.opened(toOpenRepository(repo));
        }
      },
      () => {
        // Git is missing or disabled, so there is nothing to track.
      }
    );

    return {
      dispose() {
        disposed = true;
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
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
