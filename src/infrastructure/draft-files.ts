import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { Disposable, IDraftFiles } from "../core/ports";

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export class DraftFiles implements IDraftFiles {
  watch(filePath: string, onWritten: () => void): Disposable {
    // Matching the exact name keeps this a non-recursive watch of one folder,
    // which files.watcherExclude does not apply to, and leaves the writer's
    // `.tmp` file unseen. Deletes are ignored: the only expected one is ours.
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(filePath)),
        path.basename(filePath)
      ),
      false,
      false,
      true
    );
    // A rename onto the path is reported as a create or as a change, depending
    // on whether the folder is inside the workspace.
    const subscriptions = [
      watcher.onDidCreate(() => onWritten()),
      watcher.onDidChange(() => onWritten()),
    ];
    return {
      dispose() {
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
        watcher.dispose();
      },
    };
  }

  async read(filePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async remove(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }
}
