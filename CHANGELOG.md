# Changelog

All notable changes will be documented in this file.

## [0.2.0] - 2026-04-07

### Added

- Generation now works reliably on large commits by automatically trimming oversized diffs

### Changed

- Updated to the latest models for OpenAI (GPT-4.1, o4-mini), Gemini (2.5 Flash), DeepSeek, and Mistral
- Better support for OpenAI-compatible providers
- Improved stability during network interruptions

### Fixed

- Fixed commit message box scrolling to the bottom after generation

## [0.1.3] - 2026-03-27

### Changed

- Added usage demo GIF to README for Marketplace listing

## [0.1.2] - 2026-03-24

### Fixed

- Fixed commit messages sometimes retaining markdown code fences in the output
- Fixed active repository not being recognized in multi-repo workspaces when the open file is at the repo root

## [0.1.1] - 2026-03-18

### Changed

- Updated Marketplace listing metadata and documentation

## [0.1.0] - 2026-03-12

### Added

- Generate conventional commit messages using AI models
- Multi-provider support for Anthropic, OpenAI, Gemini, DeepSeek, and Mistral
- Set Model command with quick pick UI for easy model switching
- API key prompt with quick pick UI for seamless configuration
