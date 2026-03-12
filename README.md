# AI Commit Message Generator

Generate conventional commit messages using AI models. A reliable alternative to the built-in commit message generator.

## Usage

1. Stage your changes in the Source Control view
2. Click the feather icon in the Source Control title bar
3. A commit message will be generated and placed in the input box

On first use, you'll be prompted to enter your API key. You can also set it anytime via the Command Palette: **AI Commit: Set API Key**.

## Tip: Pin the button

By default, the generate button only appears when hovering over the Source Control title bar. To make it always visible, add this to your VS Code settings:

```json
"workbench.view.alwaysShowHeaderActions": true
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `commitMessageGen.provider` | `anthropic` | AI provider to use |
| `commitMessageGen.model` | `claude-sonnet-4-6` | Model ID for generation |

## Supported Providers

- **Anthropic** — Claude Sonnet, Opus, Haiku (any Claude model ID)

More providers coming soon.

## Commit Format

Messages follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
