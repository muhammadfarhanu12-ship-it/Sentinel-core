# Playground provider support

Verified against official provider documentation on September 16–17, 2026.
The existing Playground reads `/api/v1/gateway/capabilities` dynamically, so no
frontend design or functionality changes were needed. Existing model options,
defaults, plan limits, and security checks are preserved.

## Added model IDs and minimum subscription tiers

Higher tiers include the models available on lower tiers. Free remains
Gemini-only for provider execution; Anthropic and xAI have empty Free model sets.
Budget models are assigned to Free or Pro, and premium models to Business.
The existing OpenAI assignments remain: `gpt-4o-mini` and `gpt-4o` on Pro,
and `gpt-4.1` on Business.

| Provider | Minimum tier | Added API model IDs |
| --- | --- | --- |
| OpenAI | Pro | `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5-mini`, `gpt-5-nano`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3-mini`, `o4-mini`, `gpt-3.5-turbo` |
| OpenAI | Business | `gpt-6-astra`, `gpt-5.6-sol`, `chat-latest`, `gpt-5.5`, `gpt-5.4`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `o3`, `o1`, `gpt-4`, `gpt-4-turbo` |
| Anthropic | Pro | `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5` |
| Anthropic | Business | `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-fable-5`, `claude-fable-5-1` |
| Gemini | Free | `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite` |
| Gemini | Pro | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash` |
| Gemini | Business | `gemini-3.1-pro-preview` |
| xAI | Pro | `grok-build-0.1`, `grok-4.3`, `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning` |
| xAI | Business | `grok-4.5`, `grok-4.6` |

OpenAI uses the documented text-chat aliases supported by Chat Completions;
dated duplicates and models requiring different APIs are not added.
Sources: [OpenAI catalog](https://developers.openai.com/api/docs/models/all),
[OpenAI deprecations](https://developers.openai.com/api/docs/deprecations),
[Anthropic active-model lifecycle](https://platform.claude.com/docs/en/about-claude/model-deprecations),
[Anthropic model overview](https://platform.claude.com/docs/en/models/overview),
[Gemini catalog](https://ai.google.dev/gemini-api/docs/models),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
and [xAI catalog/pricing](https://docs.x.ai/developers/pricing).

The existing Gemini 1.5 options were preserved as requested, although Google
[shut them down on September 29, 2025](https://ai.google.dev/gemini-api/docs/changelog).
Select one of the added Gemini models for live requests. OpenAI's legacy
`gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `gpt-4.1-nano`, `o1`, `o3-mini`, and
`o4-mini` are scheduled to retire October 23, 2026; the original GPT-5 family
and `o3` are scheduled for December 11, 2026, per the deprecation source above.

## Backend behavior

Anthropic uses its Messages API with `x-api-key`, the API version header,
separate system instructions, required output limits, text content blocks,
and actual usage including cache input. xAI uses its documented Chat Completions
API and handles both flat and nested error bodies. Both use the existing
configuration, timeout, authentication, rate-limit, model-availability, and
generic provider failure contracts.

OpenAI reasoning models use `max_completion_tokens` and omit incompatible
temperature controls. Gemini 3 uses its default sampling, and thought parts
are excluded from the displayed answer. Existing GPT-4 and Gemini 1.5 request
settings are preserved.

Request/error references:
[Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create),
[Anthropic errors](https://platform.claude.com/docs/en/api/errors),
[xAI API reference](https://docs.x.ai/developers/rest-api-reference),
[OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model),
[Gemini generation reference](https://ai.google.dev/api/generate-content).

## Deployment and verification

After deployment, add `ANTHROPIC_API_KEY` and `XAI_API_KEY` to the Render backend
service environment. Without real keys, the corresponding providers correctly
remain marked as not configured and cannot execute. Existing `OPENAI_API_KEY`
and `GEMINI_API_KEY` settings continue to work.

- Focused provider, gateway, schema, and tier checks: **145 passed**.
- All **16 touched Python files** passed `python -m py_compile` using the
  installed Windows Python executable and a temporary bytecode cache.
- Full suite with a temporary bridge adapting the existing MongoDB fixtures
  to the current startup functions: **220 passed, 3 failed**. Those failures
  assert outdated admin-denial message wording in `test_auth_flow_mongo.py`.
  The ordinary suite runner also encounters the existing Mongo startup fixture
  mismatch. Unrelated auth behavior and fixtures were not changed.
- Provider HTTP requests were mocked; no live paid provider calls were made.
