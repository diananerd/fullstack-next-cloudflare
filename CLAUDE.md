# Drimit Shield — Claude Guide

## Regla #1: Pipeline Contract
**`src/constants/pipeline-contract.ts` es la única fuente de verdad del pipeline.**
- El dialog, audit trail y dispatch se derivan de él. NUNCA hardcodear step keys o flags.
- `protect-artwork-dialog.tsx` y `protection-audit-trail.tsx` leen `PIPELINE_LAYERS` directamente.
- `dispatch-job.ts` mapea `config.layers[]` a Python flags via `PIPELINE_LAYERS[n].pythonFlag`.

## Añadir una capa nueva → usar `/add-pipeline-layer`
El skill guía el proceso completo. Orden de archivos:
1. `src/constants/pipeline-contract.ts` — añadir entrada en `PIPELINE_LAYERS`
2. `modal/protection/main.py` — añadir flag en `ProtectionRequest` + lógica en `run_shield_pipeline`
3. `modal/simulation/main.py` — añadir `verify_<layer>()` method
4. Verificar con `/check-contract` antes de deployar
5. Deploy: **simulation SIEMPRE antes que protection**

La UI (dialog + audit trail) se actualiza sola via el contrato.

## Storage Convention (crítica, no cambiar)
```
Original:     {userId}/{sha256}/original.{ext}      ← createArtworkAction
Protected:    {userId}/{sha256}/protected.png        ← Python deriva de image_r2_key
Verification: {userId}/{sha256}/verification/{layer}.png
```
Frontend infiere todos los paths desde `artwork.r2Key` (strip filename).

## Contrato TS → Python (campos del payload en dispatch-job.ts)
```
image_r2_key, r2_public_base_url   ← routing de output en R2
use_identity_shield                ← layer_1
use_style_poison                   ← layer_2
use_edit_immunity                  ← layer_3
use_watermark                      ← layer_4
intensity, watermark_text          ← config
```
Al añadir una capa, dispatch-job.ts se actualiza solo via el contrato.

## Entornos
| Entorno   | Comando                       | DB                              | R2                        |
|-----------|-------------------------------|----------------------------------|---------------------------|
| Local     | `pnpm dev` / `wrangler dev`   | D1 local (SQLite)               | `drimit-shield-dev-bucket`|
| Preview   | `wrangler dev --env preview`  | `db:migrate:preview`            | preview bucket            |
| Prod      | `pnpm deploy`                 | `db:migrate:prod`               | `drimit-shield-bucket`    |

## ML Quality Targets
- SSIM > 0.85 (protección imperceptible para el ojo humano)
- Layer 1: `faces_detected === 0` después de protección
- Layer 2: `style_similarity < 0.3`
- Layer 4: `watermark_detected === true` siempre
- Layer 3: actualmente noise approx (no PGD real vs VAE) — mejora pendiente

## Commands Cheat Sheet
```
/deploy-modal          Deploy simulation → protection en orden correcto
/add-pipeline-layer    Añade capa end-to-end con el contrato como guía
/check-contract        Valida que Python y TS estén en sync
/ml-experiment         Lanza job de prueba y monitorea métricas ML
/sync-envs             Compara .env.local / .dev.vars / wrangler.jsonc
/pipeline-status       Estado end-to-end: D1 + Modal Dict + logs
/posthog-check         Health check de analytics: vars, código, métricas 24h
```

## Agentes Disponibles (via Task tool)
Ver prompts en `.claude/agents/`:
- `ml-layer-dev` — implementación y debug de capas adversariales ML
- `pipeline-ui-sync` — actualiza UX del dialog cuando cambia el pipeline
- `modal-debugger` — traza fallos desde dispatch TS hasta logs Python
- `schema-migration` — propaga cambios de schema Drizzle al código
- `posthog-analyst` — analiza funnels, retención y métricas vía PostHog MCP

## PostHog — Analytics First Class Citizen

PostHog tracks everything. **Every new user-facing feature must include event tracking.**

### Reglas
- Eventos del servidor → `import { Analytics } from "@/lib/analytics"` (fetch directo, CF Workers safe)
- Eventos del cliente → `usePostHog()` de `posthog-js/react` (disponible via `AnalyticsProvider`)
- **Nunca duplicar** el mismo evento en server + client
- Analytics nunca bloquea el flujo principal (todos los calls son fire-and-forget)

### Evento nuevo: cómo añadirlo
1. Añadir helper tipado en `src/lib/analytics.ts` (server) o usar `ph.capture()` directamente (client)
2. Invocar en el server action o component correspondiente
3. Documentar en `.claude/agents/posthog-analyst.md` tabla de taxonomía
4. Verificar con `/posthog-check`

### Taxonomía (resumen)
| Evento | Origen | Propiedades clave |
|--------|--------|-------------------|
| `protection_dialog_opened` | Client | `artwork_id` |
| `artwork_uploaded` | Server | `artwork_id`, `size_bytes`, `mime_type` |
| `protection_started` | Server | `artwork_id`, `layers[]`, `intensity`, `cost_credits` |
| `protection_pipeline_queued` | Client | `artwork_id` — dispara surveys PostHog |
| `protection_completed` | Server (cron) | `shield_score`, `duration_ms` |
| `protection_failed` | Server (cron) | `error` |
| `credits_insufficient` | Server | `balance`, `required`, `missing` |

### Error Tracking
- Server: `Analytics.captureException(userId, error, { action, ...context })` — en todos los catch de server actions
- Client: `ph?.captureException(error, { context: "..." })` — en error boundaries
- Global browser errors: capturados automáticamente por `AnalyticsProvider` (window.onerror + unhandledrejection)
- Error boundaries: `src/app/(dashboard)/error.tsx` + `src/app/global-error.tsx`

### Feature Flags
- Server: `import { getFeatureFlag } from "@/lib/feature-flags"` — usa PostHog `/decide` endpoint
- Client: `import { useFeatureFlagEnabled } from "@/lib/feature-flags"` — hook React
- Crear flags en PostHog dashboard → documentar en `src/lib/feature-flags.ts`

### MCP (para análisis desde Claude)
Configurado en `.mcp.json`. Requiere `POSTHOG_PERSONAL_API_KEY` en el entorno.
Obtener en PostHog → Settings → Personal API Keys → preset "MCP Server".
Agente dedicado: `posthog-analyst` (accede a PostHog via MCP para análisis de funnels).

### CLI setup (primera vez)
```bash
# Wizard interactivo (hace login + setup del proyecto)
npx @posthog/wizard@latest

# Añadir MCP a Claude Code (ya configurado en .mcp.json)
npx @posthog/wizard@latest mcp add
```

### Vars requeridas
```
NEXT_PUBLIC_POSTHOG_KEY=phc_...      # Public key (client + server)
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
POSTHOG_PERSONAL_API_KEY=phx_...    # Solo para MCP (no en código)
```

## Stack
Next.js 16 + Cloudflare Workers (OpenNext) + D1 (Drizzle) + R2 + Modal.com T4 GPU
Auth: better-auth | Billing: Stripe | Analytics: PostHog | Deploy: `pnpm deploy`
Python: `.venv/bin/modal deploy modal/<app>/main.py`
DB: `pnpm db:generate` → `pnpm db:migrate:local`
Lint: `pnpm lint` (biome)
