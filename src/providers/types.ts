export interface CommitMessageProvider {
  readonly name: string;
  generate(diff: string): Promise<string>;
  dispose(): void;
}
