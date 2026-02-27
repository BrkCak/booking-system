# Copilot Instructions for booking-system

This repository contains a booking API and an MCP booking server.
When generating code, reviews, and suggestions, follow these rules.

## Review Priorities

- Prioritize correctness and regression risk over style nits.
- Focus on security-relevant paths first: external input, API boundaries, and error handling.
- Highlight concrete fixes, not only generic warnings.

## TypeScript and Validation

- Keep strict TypeScript safety: avoid `any`, prefer explicit types at API boundaries.
- Validate and narrow all untrusted inputs (HTTP requests, MCP tool inputs, env vars).
- Keep runtime validation close to boundaries (e.g. zod schemas for tool inputs and payloads).

## API and Contract Safety

- Preserve backward compatibility for booking contracts unless the PR explicitly migrates them.
- Treat booking status values as a stable contract (`PENDING`, `CONFIRMED`, `REJECTED`).
- Flag changes that alter response shape, status semantics, or error payloads without tests/docs.

## Error Handling

- Ensure errors are actionable but do not leak sensitive internals.
- Prefer consistent error envelopes and status codes across services.
- When parsing upstream error responses, handle non-JSON bodies safely.

## MCP Server Specific

- Verify tool names and schemas remain stable (`create_booking`, `get_booking`).
- Ensure stdio transport output remains protocol-safe (no stdout noise outside MCP messages).
- Check that tool failures set `isError: true` and include useful user-facing text.

## Testing Expectations

- Request tests for behavior changes in booking flows, status transitions, and error paths.
- For contract changes, require integration-level coverage (API + MCP boundary where relevant).
- If tests are not added, ask for rationale in the PR description.

## Comment Style

- Keep comments concise and actionable.
- Include file/line context and, when possible, a concrete patch suggestion.
- Use severity labels when useful: `high`, `medium`, `low`.
