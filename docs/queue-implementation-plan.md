# Plan de Implementación: Sistema de Colas FIFO con Prioridad de Integridad

Este documento detalla el plan para transformar el sistema de procesamiento inmediato a un sistema de colas gestionado, respetando los límites de concurrencia del Free Tier de Modal y garantizando que los pipelines iniciados se completen antes de saturar el sistema con nuevos trabajos.

## 1. Configuración y Límites (Modal Free Tier)

El Free Tier de Modal tiene límites de concurrencia (contenedores simultáneos). Para evitar errores de "Rate Limit" o colas ocultas en el lado de Modal, gestionaremos la cola en nuestra base de datos.

*   **Constante:** `MAX_CONCURRENT_JOBS = 3`
    *   *Justificación:* Modal free tier suele permitir ~5 contenedores. Usaremos 3 para dejar margen para funciones auxiliares (como el Cron, previsualizaciones o picos de latencia) y evitar bloqueos.
*   **Constante:** `JOB_TIMEOUT_MINUTES = 15`
    *   *Justificación:* Cada paso individual del pipeline no debe exceder los 15 minutos. Si esto ocurre, se considera fallo y se cancela para liberar el slot.

## 2. Estrategia de Priorización (Integridad de Pipeline)

Para evitar que un pipeline se quede "a medias" (ej. paso 1 ok, paso 2 esperando 3 días), implementaremos una estrategia de selección de trabajos con dos niveles de prioridad:

1.  **Prioridad Alta (Continuación):** Trabajos `PENDING` con `step_order > 0`.
    *   *Por qué:* Representan pipelines ya iniciados. Debemos terminarlos para liberar recursos y entregar valor al usuario.
2.  **Prioridad Normal (Nuevos Ingresos):** Trabajos `PENDING` con `step_order == 0`.
    *   *Ordenamiento:* FIFO (First-In, First-Out) basado en `created_at` (o `id` incremental).

## 3. Cambios en la Lógica de Negocio (`PipelineService`)

### A. Modificar `startPipeline`
**Actual:** Crea el Job 0 y llama a `dispatchJob` inmediatamente.
**Nuevo:** Crea el Job 0 en estado `PENDING` y **termina**. No despacha nada. Deja que el Cron lo recoja.

### B. Modificar `advancePipelines`
**Actual:** Detecta Job completado, crea el siguiente Job y llama a `dispatchJob`.
**Nuevo:** Detecta Job completado, crea el siguiente Job en estado `PENDING` y **termina**. El trabajo creado tendrá `step_order > 0`, por lo que será recogido con Prioridad Alta en el siguiente ciclo.

### C. Nueva Función: `processQueue`
Esta será la nueva función "cerebro" que se ejecutará al final del Cron.

**Pseudocódigo:**
```typescript
async function processQueue() {
  // 1. Verificar Capacidad
  const activeJobsCount = await db.count(artworkJobs, 
    status IN ('QUEUED', 'PROCESSING')
  );
  
  const slotsAvailable = MAX_CONCURRENT_JOBS - activeJobsCount;
  
  if (slotsAvailable <= 0) {
    console.log("Cola Llena. Esperando...");
    return;
  }

  // 2. Buscar Trabajos Prioritarios (Pipelines en curso)
  const highPriorityJobs = await db.select().from(artworkJobs)
    .where(status = 'PENDING' AND step_order > 0)
    .orderBy(asc(createdAt))
    .limit(slotsAvailable);

  let jobsToDispatch = [...highPriorityJobs];

  // 3. Rellenar huecos con Nuevos Pipelines (si sobran slots)
  if (jobsToDispatch.length < slotsAvailable) {
    const remainingSlots = slotsAvailable - jobsToDispatch.length;
    
    const newPipelineJobs = await db.select().from(artworkJobs)
      .where(status = 'PENDING' AND step_order = 0)
      .orderBy(asc(createdAt)) // FIFO
      .limit(remainingSlots);
      
    jobsToDispatch = [...jobsToDispatch, ...newPipelineJobs];
  }

  // 4. Despachar
  for (const job of jobsToDispatch) {
    await dispatchJob(job.id);
  }
}
```

## 4. Actualización del Cron Job (`route.ts`)

El flujo de ejecución del Cron cambiará para ser estrictamente secuencial:

1.  **Sincronización:** `await PipelineService.syncRunningJobs()`
    *   Actualiza estados. Libera slots si algo terminó (COMPLETED/FAILED).
2.  **Mantenimiento:** `await PipelineService.advancePipelines()`
    *   Crea los siguientes pasos para trabajos terminados (los pone en PENDING).
3.  **Despacho:** `await PipelineService.processQueue()`
    *   Llena los slots libres usando la lógica de prioridad.

## 5. Auditoría de Seguridad ante Fallos

*   **¿Qué pasa si el Cron falla?**
    *   **Zombie Check (Strict 15m):** En `syncRunningJobs`, implementaremos una verificación estricta. Si `now - updatedAt > 15 minutos`, el trabajo se marca como FAILED ("Timeout Limit Exceeded").
    *   Esto libera el slot inmediatamente para que `processQueue` pueda asignar otro trabajo en el mismo ciclo.

## 6. Integración Sistémica: El Ciclo de Vida Unificado

La integración de Polling, Advance y Queue funcionará como un reloj en cada tick del Cron:

1.  **Fase de Limpieza (Polling - `syncRunningJobs`):**
    *   El sistema consulta a Modal status de trabajos `PROCESSING`.
    *   Si Modal dice "Completed", pasamos a `COMPLETED`. **Resultado:** Se libera un slot virtual.
    *   Si Modal no responde o el tiempo > 15 min, marcamos `FAILED`. **Resultado:** Se libera un slot virtual y se aborta el pipeline.

2.  **Fase de Preparación (Advance - `advancePipelines`):**
    *   Busca trabajos que acaban de pasar a `COMPLETED` en la fase 1.
    *   Si hay siguiente paso, crea el registro en DB con status `PENDING` y `step_order > 0`.
    *   **Importante:** NO despacha nada. Solo prepara la "munición" de alta prioridad para la cola.

3.  **Fase de Ejecución (Queue - `processQueue`):**
    *   Calcula slots libres (`MAX - processing_count`).
    *   Si hay espacio, toma primero los trabajos generados en la Fase 2 (Alta Prioridad).
    *   Si aún hay espacio, toma los trabajos nuevos de usuarios esperando (Baja Prioridad).
    *   Despacha las peticiones a Modal.

Este ciclo asegura que **nunca saturamos** al proveedor externo y que los pipelines **fluyen hasta terminar** antes de empezar nuevos masivamente.

## 7*   La lógica existente de "Zombie Check" (timeout > 30m) en `syncRunningJobs` lo matará, liberando el slot para que la cola avance.

## 6. Próximos Pasos de Implementación

1.  Refactorizar `startPipeline` y `advancePipelines` para eliminar `dispatchJob`.
2.  Implementar `processQueue` en `PipelineService`.
3.  Actualizar el endpoint `api/cron` para incluir la llamada a `processQueue`.
