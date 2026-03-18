# AI Commit Message Gen

AI Commit Message Gen is a VS Code extension for generating Git commit messages with AI directly inside the Source Control view. It creates clean [Conventional Commits](https://www.conventionalcommits.org/) and works as a configurable alternative to the built-in commit message generator.

If you want an AI commit message generator for VS Code that supports multiple providers and models, this extension is built for that workflow.

## AI Commit Message Generator for VS Code

Generate commit messages in VS Code without leaving your editor:

1. Stage your changes in the Source Control view.
2. Click the feather button in the Source Control title bar.
3. The extension writes an AI-generated commit message into the commit input box.

On first use, the extension prompts you for an API key for the currently selected model provider.

## Why Use This Extension

- Generate Git commit messages with AI inside VS Code.
- Produce consistent Conventional Commit messages.
- Choose from multiple AI providers and models.
- Replace the default VS Code commit message generator with a more effective option.
- Keep API keys secure with VS Code SecretStorage.

## Supported AI Models

Use the commit message generator with models from Anthropic, OpenAI, Google, DeepSeek, and Mistral.

| Provider | Models |
| -------- | ------ |
| **Claude** (Anthropic) | Sonnet 4.6, Opus 4.6, Haiku 4.5 |
| **GPT** (OpenAI) | GPT-4o, GPT-4o Mini, o3-mini |
| **Gemini** (Google) | 2.5 Pro, 2.0 Flash |
| **DeepSeek** | V3, R1 |
| **Mistral** | Large, Codestral |

## VS Code Commands

- `AI Commit: Set Model`
- `AI Commit: Set API Key`
- `AI Commit: Clear API Key`

Each provider uses its own API key. Keys are stored securely using VS Code SecretStorage. If no key is set for the selected provider, you will be prompted when you generate a commit message.

## Conventional Commit Format

Generated messages follow the Conventional Commits format:

```text
<type>(<scope>): <description>

[optional body]
```

Common commit types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Tip: Keep the Generate Button Visible

By default, the Source Control title bar button appears on hover. To keep it pinned in VS Code, add this setting:

```json
"workbench.view.alwaysShowHeaderActions": true
```

## ⭐ If It Helps You

If this extension saves you time, consider leaving a rating on the VS Code Marketplace.

It helps other developers discover it.
