import { IGitRepository, IGitService } from "../core/ports";
import { getGitAPI, getActiveRepository, getStagedDiff } from "../git";

export class GitService implements IGitService {
  async getActiveRepository(): Promise<IGitRepository> {
    const git = await getGitAPI();
    const repo = await getActiveRepository(git);
    return {
      rootPath: repo.rootUri.fsPath,
      setCommitMessage(message: string) {
        repo.inputBox.value = message;
      },
    };
  }

  getStagedDiff(repoRoot: string): Promise<string> {
    return getStagedDiff(repoRoot);
  }
}
