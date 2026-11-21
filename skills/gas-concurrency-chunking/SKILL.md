---
name: gas-concurrency-chunking
description: >-
  Gestión de concurrencia multinivel con LockService, algoritmo de retroceso exponencial con decorrelated jitter,
  y fragmentación de tareas masivas (Job Chunking) para superar el límite estricto de 6 minutos de Google Apps Script.
  Usar cuando: existan escrituras concurrentes, generación de consecutivos o procesos por lotes que puedan acercarse al límite de 6 minutos en GAS.
  NO usar cuando: la concurrencia sea en bases SQL/Redis o colas fuera de Google Apps Script.
---

# Concurrencia y Fragmentación Masiva (`gas-concurrency-chunking`)

Patrones para gobernar acceso concurrente con **`LockService`** y ejecutar procesos largos mediante **fragmentación transaccional (*Job Chunking*)** sin exceder el límite de **6 minutos (360.000 ms)** de Google Apps Script.

Para implementaciones completas (`LockManager` con *Decorrelated Jitter*, `ChunkingProcessor` y tabla `PropertiesService` vs `CacheService`), consultar [`references/concurrency-chunking-patterns.md`](./references/concurrency-chunking-patterns.md).

---

## 1. Jerarquía de Cerrojos (`LockService`)

- **`getScriptLock()`**: global a todas las ejecuciones del script (obligatorio para consecutivos y tablas compartidas).
- **`getDocumentLock()`**: acotado al archivo contenedor actual.
- **`getUserLock()`**: acotado al usuario activo (previene doble envío).

### Reglas de Concurrencia
- **Prohibido `waitLock()` ciego**: el tope por llamada es **30.000 ms**; usar `tryLock()` en bucle con *Decorrelated Jitter*.
- **Liberación garantizada**: ejecutar `SpreadsheetApp.flush()` antes de salir y `lock.releaseLock()` siempre en bloque `finally`.

---

## 2. Fragmentación Masiva (*Job Chunking*)

1. Medir tiempo transcurrido desde `Date.now()`.
2. Al alcanzar **4.5 minutos (270.000 ms)**, guardar el cursor en `PropertiesService` (**nunca** en `CacheService`, porque puede expirar).
3. Programar reanudación con `ScriptApp.newTrigger(fn).timeBased().after(60 * 1000).create()`.
4. Al terminar el lote completo, eliminar la propiedad cursor y purgar los triggers temporales residuales.
5. **Cuota diaria de triggers**: 1 hora/día (`@gmail.com`) vs 6 h/día (Google Workspace).

---

## 3. Checklist de Verificación

- Todo acceso a `LockService` usa `tryLock()` + `finally { lock.releaseLock(); }`.
- Los cursores de reanudación se persisten en `PropertiesService` (máx. 9 KB/valor).
- Al finalizar el *chunking*, se limpian propiedades y triggers huérfanos.
