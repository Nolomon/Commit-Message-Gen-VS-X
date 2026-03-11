import * as vscode from "vscode";
import { execFile } from "child_process";

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

export async function getGitAPI(): Promise<GitAPI> {
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

export async function getActiveRepository(
  git: GitAPI
): Promise<Repository> {
  const repos = git.repositories;

  if (repos.length === 0) {
    throw new Error("No Git repositories found in the workspace.");
  }

  if (repos.length === 1) {
    return repos[0];
  }

  // If multiple repos, try to match the active editor's workspace
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const activeUri = activeEditor.document.uri;
    const match = repos.find((repo) =>
      activeUri.fsPath.startsWith(repo.rootUri.fsPath)
    );
    if (match) {
      return match;
    }
  }

  // Let user pick
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

export function getStagedDiff(repoRoot: string): Promise<string> {
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
