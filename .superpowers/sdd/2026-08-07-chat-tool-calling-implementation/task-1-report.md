# Task 1 Report

## Changes

- Extended `APIMessage` with `tool` role, tool call payloads, and tool call IDs.
- Added prompt post-processing and tool protocol settings with defaults (`none`, `auto`, enabled).
- Added per-character tool permission types, defaults, and normalization for legacy records.
- Applied character normalization on CharacterService reads, creates, and updates.
- Added focused type/default tests.

## Verification

- `npx vitest run src/api/OpenAICompatible.types.test.ts src/types/character.test.ts`: passed (2 files, 3 tests).
- `npm run type-check`: existing unrelated errors remain; initial APISettings literal errors were avoided by keeping new settings fields optional for legacy call sites.

## Commit

`c95f7e6 feat: add tool calling and prompt processing types`

## Concerns

- New API settings fields are optional at the type boundary so existing non-chat callers and persisted profiles remain source-compatible; default constructors provide the required runtime defaults.
