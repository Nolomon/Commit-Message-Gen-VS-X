# AGENTS.md

VS Code extension that generates Conventional Commit messages from the staged diff using an
LLM (Anthropic, OpenAI, Google, DeepSeek, Mistral). TypeScript, bundled with esbuild, tested
with Vitest.

## Commands

- `npm install` — install dependencies
- `npm run compile` — type-check (`tsc`); run this before finishing a change
- `npm test` — run the test suite once
- `npm run test:coverage` — tests with v8 coverage
- `npm run build` — production bundle to `dist/`
- `npm run watch` — rebuild on change (for debugging in the Extension Development Host)
- `npm run package` — build and produce the `.vsix`

## Layout

- `src/extension.ts` — activation: builds services and registers commands
- `src/commands/` — command handlers; each is a factory that takes its dependencies
- `src/core/` — business logic, no `vscode` imports. `ports.ts` defines the interfaces
  (`IGitService`, `ISecretStore`, `IConfigService`, `IProviderFactory`) the rest depends on
- `src/infrastructure/` — `vscode`-backed implementations of those ports
- `src/providers/` — LLM provider clients, the provider registry, and the model catalog
  (`models.ts`)
- `src/__tests__/` — Vitest tests; `vscode` is aliased to `__mocks__/vscode.ts`

## Adding or retiring a model

The model list is duplicated and must stay in sync across:

- `src/providers/models.ts`
- `package.json` → `contributes.configuration.properties["commitMessageGen.model"]`
  (`enum`, `enumItemLabels`, `markdownEnumDescriptions`)
- `README.md` model table
- `.github/ISSUE_TEMPLATE/bug_report.yml`

When retiring a model, map its ID to its replacement in `RETIRED_MODEL_REPLACEMENTS`
(`src/providers/models.ts`) so users who had it selected are migrated on activation.

## TypeScript

- Never cast to `any`. Use a typed cast (e.g., `value as SomeType`), `Partial<>`, or a type
  guard instead.
- If an inline type would be repeated in more than one place, extract it into a named `type`
  or `interface` instead.

## Testing and mocks

- **Minimal stubs**: For one-off tests, mock only the interface methods your test needs and
  cast with `as MyInterface`.
- **Full stubs for shared mocks**: For mocks reused across multiple tests or large interfaces,
  provide default implementations for all methods. Use a factory/helper function to allow
  overriding only the needed methods.
- **Use `Partial<>` when appropriate**: Allows optional implementation of interface
  properties, giving flexibility while keeping some type safety.
- **Reusable pattern**: Create mock factories that provide defaults for all interface
  properties. Override only what each test cares about to balance conciseness with type
  safety.

## Commits and branches

- Conventional Commits: `<type>(<scope>): <description>`, types `feat`, `fix`, `docs`,
  `refactor`, `test`, `chore`.
- Work on feature branches; releases are cut directly on `main` (see the `release` skill in
  `.claude/skills/release/SKILL.md`).
- Never commit `dist/`, `coverage/`, or `*.vsix`. Never push tags without the maintainer's
  approval.

## Changelog

`CHANGELOG.md` entries describe user-facing symptoms, not internal fix mechanisms — what
someone using the extension noticed, in their terms. Write "DeepSeek models returned an API
error on every attempt", not "corrected the request payload shape". Keep entries short; don't
over-explain.
