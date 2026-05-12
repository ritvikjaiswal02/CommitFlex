# DevVoice — Architecture

> A typed AI orchestration system for developer content generation.  
> GitHub commits → structured AI pipeline → LinkedIn + Twitter drafts.

---

## Request Lifecycle

```
Browser  →  POST /api/repos
              └─ Auth check + idempotency guard
                   └─ lib/pipeline/run.ts
                        ├─ lib/github/   (fetch + filter + sanitize commits)
                        ├─ lib/ai/       (summarize → narrative → posts)
                        │   provider.ts  (generateStructured<T> interface)
                        │   normalize.ts (repair Claude JSON)
                        ├─ lib/validators/ (Zod — every AI output)
                        └─ lib/db/queries/ (all DB writes live here only)
```

AI functions are pure — they take typed inputs and return typed outputs.  
The pipeline layer owns all persistence, retries, logging, and status transitions.

---

## Pipeline Stages

| # | Status | Service | Input → Output |
|---|--------|---------|----------------|
| 1 | `fetching_commits` | `lib/github/` | repo → `FilteredCommits` |
| 2 | `summarizing` | `lib/ai/summarize.ts` | commits → `CommitSummary` |
| 3 | `extracting_narrative` | `lib/ai/narrative.ts` | summary + voice → `Narrative` |
| 4 | `generating_posts` | `lib/ai/posts.ts` | narrative + voice → `GeneratedPost[]` |

Each stage is isolated. Failures retry only the failed stage. Successful stages are never re-executed.

---

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `repos` | Connected GitHub repos, `lastAnalyzedCommitSha` for dedup |
| `generation_jobs` | Full job lifecycle: `queued → fetching_commits → summarizing → extracting_narrative → generating_posts → completed / partial_completed / failed / cancelled` |
| `commit_snapshots` | Every commit seen, with `includedInGeneration` flag |
| `commit_summaries` | Intermediate artifact — persisted domain object |
| `extracted_narratives` | Intermediate artifact — reused on draft regeneration |
| `post_drafts` | 4 per job (2 LinkedIn + 2 Twitter), `originalContent` + `editedContent`, full provenance via `narrativeId` + `summaryId` |
| `ai_generation_logs` | Per-stage: promptText, outputText, tokens, cost, duration, promptVersion |
| `pipeline_events` | Stage transitions, retries, validation failures — full replay log |
| `voice_settings` | Tone preset + custom description per user |

---

## AI Provider Abstraction

```typescript
interface AIProvider {
  generateStructured<T>(params: {
    systemPrompt: string
    userPrompt: string
    schema: ZodSchema<T>
    promptVersion: string
  }): Promise<T>
}
```

Anthropic (`claude-sonnet-4-6`) is the only implementation. Switching providers means adding one new file — zero pipeline changes.

**Circuit breaker:** if > 50% of AI calls fail within 5 minutes, new jobs are rejected with `503 retryAfter: 120s`. Prevents runaway retry cost during provider outages.

---

## Cost Model

| Operation | Claude calls | Est. cost |
|-----------|-------------|-----------|
| Full generation run | 4 | ~$0.019 |
| Single draft regenerate | 1 | ~$0.003 |
| Pro user/month (8 runs) | 32 | ~$0.15 |

Regeneration reuses the stored `Narrative` — no re-summarization, no re-extraction.

---

## Observability

Every Claude call logs: prompt, output, tokens, cost, duration, model, promptVersion.  
Every pipeline stage writes an event: `stage_started`, `stage_completed`, `retry_triggered`, `validation_failed`.  
Any generation job is fully reconstructible from `pipeline_events` alone.

```sql
-- Failure rate by AI stage
SELECT stage, COUNT(*) FILTER (WHERE NOT success)::float / COUNT(*) AS fail_rate
FROM ai_generation_logs GROUP BY stage;

-- Cost per user this month
SELECT user_id, SUM(estimated_cost_usd)
FROM ai_generation_logs WHERE created_at > now() - interval '30 days'
GROUP BY user_id;
```

---

## Tech Stack

Next.js 14 (App Router) · Neon PostgreSQL · Drizzle ORM · Auth.js · Anthropic Claude API · Zod · Tailwind + shadcn/ui · Vercel

No Redis · No queues · No workers · No microservices.  
Complexity is introduced only when load demands it.
