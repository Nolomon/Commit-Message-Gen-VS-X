import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { DraftFiles } from "../infrastructure/draft-files";

type Listener = (uri: vscode.Uri) => void;

/** A file system watcher whose events the test can fire. */
function makeWatcher() {
  const listeners = { create: new Set<Listener>(), change: new Set<Listener>() };
  const subscribe = (set: Set<Listener>) =>
    vi.fn((listener: Listener) => {
      set.add(listener);
      return { dispose: () => set.delete(listener) };
    });
  const watcher = {
    onDidCreate: subscribe(listeners.create),
    onDidChange: subscribe(listeners.change),
    onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  };
  const fire = (set: Set<Listener>) => set.forEach((listener) => listener(vscode.Uri.file("/x")));
  return {
    watcher: watcher as Partial<vscode.FileSystemWatcher> as vscode.FileSystemWatcher,
    fireCreate: () => fire(listeners.create),
    fireChange: () => fire(listeners.change),
    listenerCount: () => listeners.create.size + listeners.change.size,
  };
}

describe("DraftFiles", () => {
  const mockWorkspace = vi.mocked(vscode.workspace);
  let draftFiles: DraftFiles;

  beforeEach(() => {
    vi.clearAllMocks();
    draftFiles = new DraftFiles();
  });

  describe("watch", () => {
    it("watches the exact file name in its folder, so the .tmp file never matches", () => {
      mockWorkspace.createFileSystemWatcher.mockReturnValueOnce(makeWatcher().watcher);

      draftFiles.watch("/repo/.git/COMMIT_MSG_DRAFT", vi.fn());

      const [pattern] = mockWorkspace.createFileSystemWatcher.mock.calls[0];
      const relative = pattern as vscode.RelativePattern;
      expect(relative).toBeInstanceOf(vscode.RelativePattern);
      expect((relative.base as unknown as vscode.Uri).fsPath).toBe("/repo/.git");
      expect(relative.pattern).toBe("COMMIT_MSG_DRAFT");
    });

    it("asks for create and change events but not delete events", () => {
      const { watcher } = makeWatcher();
      mockWorkspace.createFileSystemWatcher.mockReturnValueOnce(watcher);

      draftFiles.watch("/repo/.git/COMMIT_MSG_DRAFT", vi.fn());

      expect(mockWorkspace.createFileSystemWatcher).toHaveBeenCalledWith(
        expect.anything(),
        false,
        false,
        true
      );
      expect(watcher.onDidDelete).not.toHaveBeenCalled();
    });

    it("reports a file that appears", () => {
      const fake = makeWatcher();
      mockWorkspace.createFileSystemWatcher.mockReturnValueOnce(fake.watcher);
      const onWritten = vi.fn();
      draftFiles.watch("/repo/.git/COMMIT_MSG_DRAFT", onWritten);

      fake.fireCreate();

      expect(onWritten).toHaveBeenCalledTimes(1);
    });

    it("reports a rename over an existing file, which arrives as a change", () => {
      const fake = makeWatcher();
      mockWorkspace.createFileSystemWatcher.mockReturnValueOnce(fake.watcher);
      const onWritten = vi.fn();
      draftFiles.watch("/repo/.git/COMMIT_MSG_DRAFT", onWritten);

      fake.fireChange();

      expect(onWritten).toHaveBeenCalledTimes(1);
    });

    it("stops reporting and releases the watcher on dispose", () => {
      const fake = makeWatcher();
      mockWorkspace.createFileSystemWatcher.mockReturnValueOnce(fake.watcher);
      const onWritten = vi.fn();

      draftFiles.watch("/repo/.git/COMMIT_MSG_DRAFT", onWritten).dispose();
      fake.fireCreate();

      expect(fake.listenerCount()).toBe(0);
      expect(fake.watcher.dispose).toHaveBeenCalledTimes(1);
      expect(onWritten).not.toHaveBeenCalled();
    });
  });

  describe("on disk", () => {
    let dir: string;
    let file: string;

    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-files-"));
      file = path.join(dir, "COMMIT_MSG_DRAFT");
    });

    afterEach(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it("reads the file's text", async () => {
      await fs.writeFile(file, "feat: draft\n\n- body\n");

      await expect(draftFiles.read(file)).resolves.toBe("feat: draft\n\n- body\n");
    });

    it("reads a missing file as undefined", async () => {
      await expect(draftFiles.read(file)).resolves.toBeUndefined();
    });

    it("passes on other read failures", async () => {
      await expect(draftFiles.read(dir)).rejects.toThrow();
    });

    it("deletes the file", async () => {
      await fs.writeFile(file, "feat: draft\n");

      await draftFiles.remove(file);

      await expect(fs.access(file)).rejects.toThrow();
    });

    it("treats deleting a file that is already gone as done", async () => {
      await expect(draftFiles.remove(file)).resolves.toBeUndefined();
    });

    it("passes on other delete failures", async () => {
      await expect(draftFiles.remove(path.join(file, "nested"))).resolves.toBeUndefined();
      await fs.writeFile(file, "not a directory");
      await expect(draftFiles.remove(path.join(file, "nested"))).rejects.toThrow();
    });
  });
});
