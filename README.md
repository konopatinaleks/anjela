# Anjela

Memory-aware LLM chat agent with the Anjela persona: an adult, confident, sharp-tongued, flirtatious but strictly non-explicit character.

## Requirements

Node.js >= 22.13 (uses the built-in `node:sqlite`; no npm dependencies).

## Run locally

```bash
export LLM_API_KEY=sk-...   # any OpenAI-compatible provider
npm start
```

Open http://localhost:3000. Without `LLM_API_KEY` the app still runs but answers with canned fallback lines.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `LLM_API_KEY` (or `OPENAI_API_KEY`) | – | API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL (OpenRouter, Ollama, ...) |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_TEMPERATURE` | `0.9` | Sampling temperature |
| `DB_PATH` | `data/anjela.db` | SQLite file |
| `PORT` | `3000` | HTTP port |
| `HISTORY_LIMIT` | `12` | Recent messages sent to the model |
| `SUMMARIZE_AFTER` | `30` | Message count after which older chat is summarized |
| `MEMORY_LIMIT` | `6` | Max memory snippets per prompt |

## How it learns

- **Identity**: the browser generates a stable `userId` (localStorage) sent with every request.
- **Storage**: SQLite tables `users` (name, preferred tone, flirt level, reply length, memory summary), `messages`, `memories`, `feedback`.
- **Prompt**: persona/system rules + user profile + memory summary + relevant memories + recent history.
- **Memory**: facts such as name, likes, dislikes are extracted from messages (RU/EN patterns) and retrieved by keyword overlap. Requests like "короче" / "подробнее" / "мягче" / "пожёстче" update the profile.
- **Summarization**: for long chats, older messages are folded into `memory_summary` by the LLM.
- **Feedback**: 👍/👎 under each reply. A like raises the flirt level (up to 4) and stores the liked style; a dislike lowers it and stores an "avoid" memory that is always injected.

## API

- `POST /api/chat` `{ "userId": "...", "message": "..." }` → `{ "reply", "messageId" }`
- `POST /api/feedback` `{ "userId": "...", "messageId": 1, "rating": 1 | -1, "comment"?: "..." }` → `{ "ok": true }`

## Tests

```bash
npm test
```

## Docker

```bash
docker build -t anjela-chat .
docker run --rm -p 3000:3000 -e LLM_API_KEY=sk-... -v anjela-data:/app/data anjela-chat
```
