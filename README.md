# AI Commit Message Gen

Generate conventional commit messages using AI models. A reliable alternative to the built-in commit message generator.

## Usage

1. Stage your changes in the Source Control view
2. Click the feather icon in the Source Control title bar
3. A commit message will be generated and placed in the input box

On first use, you'll be prompted to enter your API key for the selected model's provider.

## Tip: Pin the button

By default, the generate button only appears when hovering over the Source Control title bar. To make it always visible, add this to your VS Code settings:

```json
"workbench.view.alwaysShowHeaderActions": true
```

## Supported Models

| Provider | Models |
| -------- | ------ |
| **Claude** (Anthropic) | Sonnet 4.6, Opus 4.6, Haiku 4.5 |
| **GPT** (OpenAI) | GPT-4o, GPT-4o Mini, o3-mini |
| **Gemini** (Google) | 2.5 Pro, 2.0 Flash |
| **DeepSeek** | V3, R1 |
| **Mistral** | Large, Codestral |

## Commands

- **Set Model**: Command Palette → `AI Commit: Set Model`
- **Set / Update API Key**: Command Palette → `AI Commit: Set API Key`
- **Clear API Key**: Command Palette → `AI Commit: Clear API Key`

Each provider requires its own API key, stored securely via VS Code's SecretStorage. If no key is set for the selected model's provider, you'll be prompted to enter one when generating.

## Commit Format

Messages follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

```text
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
