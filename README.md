# Anjela

Memory-aware LLM chat with a fixed persona: an adult, confident, sharp-tongued woman. Flirtatious, never explicit.

## Requirements

Node.js >= 22.13. Storage uses the built-in `node:sqlite` module, so there are no npm dependencies.

## Run locally

```bash
export LLM_API_KEY=sk-...   # any OpenAI-compatible provider; a dummy value works for Ollama
npm start
```

Open http://localhost:3000. Without `LLM_API_KEY` the app still runs and answers with a short fallback line.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `LLM_API_KEY` or `OPENAI_API_KEY` | – | API key. Required to call the model. |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_TEMPERATURE` | `0.9` | Sampling temperature |
| `LLM_TIMEOUT_MS` | `30000` | Request timeout |
| `DB_PATH` | `data/anjela.db` | SQLite file |
| `PORT` | `3000` | HTTP port |
| `HISTORY_LIMIT` | `12` | Recent messages sent to the model |
| `SUMMARIZE_AFTER` | `30` | Message count after which older chat is summarized |
| `MEMORY_LIMIT` | `6` | Max memory snippets per prompt |
| `RATE_LIMIT` | `30` | Chat or feedback calls per user per window |
| `RATE_WINDOW_MS` | `60000` | Rate-limit window |

## How it learns

- The browser keeps a stable `userId` in `localStorage` and sends it with every request.
- SQLite stores the profile, messages, extracted memories and ratings. Refreshing the page reloads the thread.
- Each prompt is the persona, the profile, a rolling summary, relevant memories and recent history. Extracted notes are labeled untrusted so they cannot override the persona.
- Name, likes, dislikes and a few facts are extracted with RU/EN patterns. Phrases such as "короче", "подробнее", "мягче" and "пожёстче" update the profile.
- Once a chat is long enough, older messages are summarized in the background, after the reply is sent.
- A like or dislike is stored once per reply. The first rating nudges flirt level (likes stop at 4). Repeating the same rating does nothing. Switching it moves the level and replaces the style memory.
- "Забыть меня" deletes that user's rows and starts a new local id.

## API

- `GET /api/health` → `{ "ok": true, "llm": true }`
- `GET /api/history?userId=...` → `{ "messages": [{ "id", "role", "content", "rating" }] }`
- `POST /api/chat` `{ "userId", "message" }` → `{ "reply", "messageId" }`
- `POST /api/feedback` `{ "userId", "messageId", "rating": 1 | -1, "comment"? }` → `{ "ok": true }`
- `POST /api/reset` `{ "userId" }` → `{ "ok": true }`

`userId` must match `[A-Za-z0-9_-]{8,64}`. Bodies are capped at 32 KB.

## Tests

```bash
npm test
```

## Docker

```bash
docker build -t anjela-chat .
docker run --rm -p 3000:3000 -e LLM_API_KEY=sk-... -v anjela-data:/app/data anjela-chat
```

The image runs as the `node` user and exposes `GET /api/health`.
