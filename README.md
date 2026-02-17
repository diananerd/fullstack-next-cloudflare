# 🛡️ Drimit Shield - AI Art Protection Platform

## 📋 Executive Summary
Drimit Shield is a comprehensive full-stack application designed to protect digital artwork from unauthorized AI training. It implements advanced adversarial techniques ("Poisoning", "Mist") to manipulate images in ways imperceptible to humans but disruptive to AI models (like Stable Diffusion or Flux).

The project uses a **hybrid architecture**: 
- **Frontend & Orchestration**: Next.js 15 on Cloudflare Workers (Edge).
- **Heavy Computation (AI)**: Modal (serverless Python GPU environments).
- **Storage & Data**: Cloudflare R2 and D1 (SQLite).

## 🏗️ Technical Architecture

### System Overview
The system follows an asynchronous, decoupled pipeline pattern to handle resource-intensive image processing tasks.

```mermaid
graph TD
    User[User / Browser] -->|Uploads Image| Next[Next.js App (Edge)]
    Next -->|Stores Original| R2[Cloudflare R2 Bucket]
    Next -->|Records Job| DB[(Cloudflare D1 Database)]
    
    subgraph "Orchestration (Next.js)"
        Next -->|1. Start Pipeline| Pipeline[Pipeline Service]
        Pipeline -->|2. Queue Job| DB
        Cron[Cron Worker] -->|3. Sync & Dispatch| Pipeline
    end
    
    subgraph "AI Engine (Modal)"
        Pipeline -->|4. Dispatch via HTTP| ModalAPI[Modal Endpoint]
        ModalAPI -->|5. Spawns| GPU[GPU Worker (Python)]
        GPU -->|6. Process & Verify| GPU
        GPU -->|7. Update State| State[modal.Dict (Shared State)]
        GPU -->|8. Upload Result| R2
    end
    
    subgraph "Feedback Loop"
        Cron -->|9. Poll Status| ModalAPI
        ModalAPI -->|10. Read State| State
        Cron -->|11. Update Job Status| DB
    end
```

### Key Components

#### 1. Frontend Layer (`src/app`)
- **Technology**: Next.js 15 (App Router), React Server Components, TailwindCSS 4, Shadcn UI.
- **Hosting**: Cloudflare Workers (via `@opennextjs/cloudflare`).
- **Core Pattern**: Server Actions are used for all data mutations (upload, protect, credit checks), ensuring type safety and code colocation.
- **UX/UI**: Features a dashboard (`/artworks`) for managing galleries, checking protection status, and viewing "Before/After" comparisons.

#### 2. Persistence Layer (`src/db`, `src/drizzle`)
- **Database**: Cloudflare D1 (SQLite).
- **ORM**: Drizzle ORM.
- **Schema Key Models**:
  - `users` & `sessions`: Authentication (Better Auth).
  - `artworks`: Stores metadata, R2 keys, and current pipeline status.
  - `artwork_jobs`: The granular unit of work. Tracks individual steps (e.g., "Poisoning", "Watermarking") and their connection to external Modal job IDs.
  - `credit_transactions`: Ledger for user credits.

#### 3. Storage Layer
- **Cloudflare R2**: Object storage for:
  - Original uploads.
  - Protected variants.
  - Verification artifacts (thumbnails showing how AI "sees" the image).

#### 4. The AI Engine (`modal/`)
- **Technology**: Modal (Python Serverless).
- **Core Logic**: Located in `modal/poisoning/main.py`.
- **Functionality**:
  - **Poisoning**: modifying pixel values to disrupt latent diffusion models.
  - **Verification**: Uses VLMs (e.g., Moondream, CLIP) to "audit" the protection by attempting to describe or reconstruct the image.
- **State Management**: Uses `modal.Dict` (`shield-job-states`) to persist job statuses across serverless function invocations, allowing the Next.js app to poll for results without a persistent connection.

## 🔄 Core User Flows

### 1. Protection Pipeline
The heart of the application is the `PipelineService` (`src/modules/artworks/services/pipeline.service.ts`).

1.  **Initiation**: User selects protection options on the UI. `protectArtworkAction` validates credits and calls `PipelineService.startPipeline`.
2.  **Job Creation**: A job entry is created in D1 with status `PENDING`.
3.  **Dispatch**:
    - A Next.js Cron (or immediate trigger) calls `processQueue`.
    - It picks up `PENDING` jobs and sends an HTTP POST to the Modal endpoint (`dispatchProtectionJob`).
    - The Modal Job ID is saved to the database, and status moves to `QUEUED`.
4.  **Async Processing**:
    - Modal spawns a GPU container. It downloads the image from R2, applies the "poison", uploads the result back to R2, and updates the `modal.Dict`.
5.  **Synchronization**:
    - The `sync-modal-status` Cron runs periodically.
    - It queries Modal with a list of active artwork IDs.
    - If Modal reports `completed`, the local database is updated with the new `outputKey` and VLM verification report.

### 2. Credit System
- Internal ledger system (`CreditService`).
- Checks balance before allowing protection jobs (`checkArtworkProtectionEligibility`).
- Future integration points for Stripe webhooks exist in `src/app/api/webhooks/stripe`.

## 🔍 Functional Analysis & Implementations

- **Adversarial Attacks**: The Python code implements complex image processing pipelines using PyTorch and Diffusers. It explicitly targets SDXL and Flux models for testing the robustnes of the protection.
- **Security**:
  - **R2 Signed URLs**: Used for secure uploads/downloads.
  - **Shared Secrets**: The Cron job is protected by a `CRON_SECRET` to prevent unauthorized triggering of the queue processor.
  - **Modal Auth**: Modal endpoints are protected by a Bearer token (`MODAL_AUTH_TOKEN`).

## ⚠️ Observations & Functional Gaps

1.  **Polling vs. Webhooks**:
    - The current architecture relies on **Polling** (`syncRunningJobs`) to get status updates from Modal.
    - **Pros**: Simpler for local development (no need for tunnels like Ngrok) and avoids handling async callbacks in a serverless environment that might time out.
    - **Cons**: Adds latency. A job might finish, but the user won't see it until the next cron tick (~1 minute).
  
2.  **Concurrency Limits**:
    - There is a `max_concurrency` constant in the Queue processor to prevent overloading the Modal account or the D1 database.

3.  **Job Identification Ambiguity**:
    - The `sync` endpoint sends `artwork_ids` to Modal, but Modal's internal logic tracks jobs. If a single artwork has multiple concurrent jobs (rare, but possible in pipelines), this map might be fragile.
    - *Code Note*: `pipeline.service.ts` comments explicitly mention this potential issue.

4.  **Zombie Job Handling**:
    - The pipeline includes logic to detect "Zombie" jobs (stuck in `PROCESSING` for > 30 mins) and auto-fails them to recover system stability.

## 🚀 Deployment & Scripts

- **Develop**: `pnpm dev:cf` (runs Next.js with Cloudflare proxy).
- **Deploy**: `pnpm deploy:cf` (deploys to Cloudflare Workers).
- **Database**:
  - `pnpm db:migrate:local` (Local SQLite).
  - `pnpm db:migrate:prod` (Remote D1).
- **Modal**:
  - `modal metric modal/poisoning/main.py` (Deploys the Python backend).

---
*Analysis generated by GitHub Copilot on Feb 12, 2026.*
