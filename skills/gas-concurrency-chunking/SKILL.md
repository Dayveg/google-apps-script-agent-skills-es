---
name: gas-concurrency-chunking
description: >-
  Gestión de concurrencia multinivel con LockService, algoritmo de retroceso exponencial con decorrelated jitter,
  y fragmentación de tareas masivas (Job Chunking) para superar el límite estricto de 6 minutos de Google Apps Script.
---

# Concurrencia y Fragmentación Masiva (`gas-concurrency-chunking`)

Esta especificación técnica detalla los patrones de ingeniería oficiales para gobernar el acceso concurrente mediante **`LockService`** y la ejecución de procesos de larga duración mediante **fragmentación transaccional (*Job Chunking*)** en Google Apps Script, conforme a las directrices de cuotas de [Google Workspace Quotas & Limitations](https://developers.google.com/apps-script/guides/services/quotas).

---

## 1. Topología y Límites de `LockService` en Google Apps Script

`LockService` implementa cerrojos de exclusión mutua distribuidos para sincronizar procesos paralelos (múltiples usuarios editando o múltiples peticiones HTTP a Web Apps):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        JERARQUÍA DE CERROJOS (LOCKSERVICE)                             │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Tipo de Cerrojo         │ Alcance y Caso de Uso Canónico                               │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 1. ScriptLock           │ Global a todas las ejecuciones del script. Obligatorio para  │
│    (getScriptLock)      │ asignación de consecutivos correlativos y tablas compartidas.│
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 2. DocumentLock         │ Acotado al archivo contenedor actual (Hoja de cálculo/Doc).   │
│    (getDocumentLock)    │ Evita bloqueos entre diferentes libros que usan el script.   │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 3. UserLock             │ Acotado al usuario activo individual. Protege contra doble   │
│    (getUserLock)        │ envío de formularios o peticiones concurrentes del operador. │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

### Límites de Plataforma:
* **Tiempo máximo de bloqueo por llamada**: **30.000 ms (30 segundos)**. Si se invoca `lock.waitLock(30000)` y otro proceso retiene el cerrojo por 30.001 ms, Google lanza una excepción irrecuperable: `Lock timeout: another process was holding the lock for too long`.
* **Regla Mandatoria**: **NUNCA** usar `waitLock` ciegamente. Usar `tryLock` gobernado por bucles de reintento con *jitter*.

---

## 2. Algoritmo de Adquisición con Retroceso Exponencial y *Decorrelated Jitter*

Cuando decenas de usuarios editan simultáneamente, los reintentos sincronizados provocan **efecto manada (*Thundering Herd Problem*)**. El algoritmo oficial de Google y AWS exige dispersar los reintentos mediante *Decorrelated Jitter*:

$$\text{Retraso} = \min\left(T_{\max}, \text{Uniforme}\left(T_{\text{base}}, \text{RetrasoPrevio} \times 3\right)\right)$$

### Implementación Canónica:

```javascript
/**
 * @fileoverview Gestor transaccional de concurrencia con LockService y Decorrelated Jitter.
 */

const LockManager = Object.freeze({
  /**
   * Ejecuta una unidad de trabajo bajo exclusión mutua con algoritmo de dispersión de contención.
   *
   * @param {Function} operacionTransaccional - Callback sin parámetros que contiene la lógica atómica.
   * @param {Object} [opciones={}]
   * @param {number} [opciones.tiempoEsperaPorIntentoMs=10000] - Tiempo máximo por solicitud de cerrojo (máx 30000).
   * @param {number} [opciones.maxIntentos=4] - Intentos antes de reportar contención.
   * @param {number} [opciones.baseDelayMs=500] - Retraso base inicial.
   * @param {number} [opciones.maxDelayMs=5000] - Retraso máximo entre intentos.
   * @param {'script'|'document'|'user'} [opciones.tipoCerrojo='script'] - Tipo de LockService.
   * @returns {ServiceResponse}
   */
  ejecutarTransaccion: function (operacionTransaccional, opciones = {}) {
    if (typeof operacionTransaccional !== 'function') {
      return Response.fail('El parámetro de operación debe ser una función ejecutable.');
    }

    const config = {
      tiempoEsperaMs: Math.min(opciones.tiempoEsperaPorIntentoMs || 10000, 30000),
      maxIntentos: opciones.maxIntentos || 4,
      baseDelayMs: opciones.baseDelayMs || 500,
      maxDelayMs: opciones.maxDelayMs || 5000,
      tipoCerrojo: opciones.tipoCerrojo || 'script'
    };

    let lock;
    if (config.tipoCerrojo === 'document') {
      lock = LockService.getDocumentLock();
    } else if (config.tipoCerrojo === 'user') {
      lock = LockService.getUserLock();
    } else {
      lock = LockService.getScriptLock();
    }

    let bloqueoAdquirido = false;
    let retrasoActual = config.baseDelayMs;

    for (let intento = 1; intento <= config.maxIntentos; intento++) {
      try {
        bloqueoAdquirido = lock.tryLock(config.tiempoEsperaMs);
        if (bloqueoAdquirido) {
          break;
        }
      } catch (errLock) {
        console.warn(`[LOCK_WARN] Excepción transitoria en intento ${intento}: ${errLock.message}`);
      }

      // Si no obtuvo el bloqueo y quedan intentos, calcular retroceso con jitter
      if (intento < config.maxIntentos) {
        // Decorrelated Jitter: Uniforme entre baseDelay y retrasoActual * 3
        const techo = Math.min(config.maxDelayMs, retrasoActual * 3);
        const tiempoDormir = Math.floor(Math.random() * (techo - config.baseDelayMs + 1)) + config.baseDelayMs;
        retrasoActual = tiempoDormir;

        console.info(`[LOCK_CONTENCION] Intento ${intento}/${config.maxIntentos} fallido. Esperando ${tiempoDormir}ms con jitter...`);
        Utilities.sleep(tiempoDormir);
      }
    }

    if (!bloqueoAdquirido) {
      return Response.fail(
        'Alta contención de concurrencia: El sistema está procesando múltiples transacciones simultáneas. Por favor reintente en unos segundos.',
        'CONCURRENCY_CONTENTION_ERROR'
      );
    }

    try {
      // Ejecución de la lógica protegida
      const resultado = operacionTransaccional();

      // Sincronizar mutaciones en Google Sheets antes de liberar el cerrojo
      SpreadsheetApp.flush();

      return Response.ok(resultado);
    } catch (errorOperacion) {
      console.error('[TRANSACCION_ERROR] Fallo dentro de la sección crítica: ' + errorOperacion.message);
      return Response.fail('Error en operación protegida: ' + errorOperacion.message, 'TRANSACTION_EXECUTION_ERROR');
    } finally {
      try {
        lock.releaseLock();
      } catch (errRelease) {
        console.warn('[LOCK_RELEASE_WARN] No se pudo liberar cerrojo explícitamente: ' + errRelease.message);
      }
    }
  }
});
```

---

## 3. Patrón de Fragmentación Masiva (*Job Chunking*)

Google Apps Script cancela forzosamente cualquier ejecución que alcance los **6 minutos (360.000 ms)** mediante un *Script Timeout*.

### Arquitectura de la Máquina de Estados:
1. El proceso arranca y mide el tiempo transcurrido con `Date.now()`.
2. Procesa elementos individuales o sub-lotes pequeños.
3. Si el tiempo alcanza los **4.5 minutos (270.000 ms)** (umbral de seguridad del 75%), **guarda su puntero de reanudación** en `PropertiesService` y crea un disparador basado en tiempo (`ScriptApp.newTrigger().timeBased().after(60000)`).
4. El script actual finaliza limpiamente en verde sin exceder cuotas.
5. El nuevo disparador despierta en 1 minuto, recupera el puntero y continúa desde donde quedó.

```javascript
/**
 * @fileoverview Motor de procesamiento masivo tolerante a límites de tiempo de 6 minutos.
 */

const ChunkingProcessor = Object.freeze({
  /**
   * Procesa una lista masiva de entidades dividiendo la carga entre ejecuciones temporizadas.
   *
   * @param {string} claveEstado - Nombre de la clave en PropertiesService para guardar el cursor.
   * @param {string} nombreFuncionReanudacion - Nombre de la función global que debe registrar el trigger.
   * @param {Function} procesarFilaCallback - Función que procesa un índice de fila: fn(numeroFila).
   * @returns {void}
   */
  ejecutarLoteConAutoReanudacion: function (claveEstado, nombreFuncionReanudacion, procesarFilaCallback) {
    const TIEMPO_INICIO = Date.now();
    const LIMITE_SEGURIDAD_MS = 270000; // 4 minutos y 30 segundos (margen de 90 segundos)
    const props = PropertiesService.getScriptProperties();

    const libro = SpreadsheetApp.getActive();
    const hoja = libro.getSheetByName('Gestion');
    const totalFilas = hoja.getLastRow();

    // Recuperar el puntero (cursor) de la última fila procesada o iniciar en fila 2
    let filaActual = parseInt(props.getProperty(claveEstado) || '2', 10);
    console.info(`[CHUNKING_START] Iniciando procesamiento desde fila ${filaActual} de ${totalFilas}.`);

    while (filaActual <= totalFilas) {
      // Control de tiempo preventivo
      if (Date.now() - TIEMPO_INICIO > LIMITE_SEGURIDAD_MS) {
        console.warn(`[CHUNKING_TIMEOUT_SHIELD] Umbral de 4.5 minutos alcanzado. Persistiendo cursor en fila ${filaActual}...`);
        props.setProperty(claveEstado, String(filaActual));

        // Programar reanudación automática en 60 segundos
        ScriptApp.newTrigger(nombreFuncionReanudacion)
          .timeBased()
          .after(60 * 1000)
          .create();

        console.info(`[CHUNKING_SCHEDULED] Disparador programado para ${nombreFuncionReanudacion} en 60s.`);
        return;
      }

      // Procesar registro individual
      try {
        procesarFilaCallback(filaActual);
      } catch (errFila) {
        console.error(`[CHUNKING_ROW_ERROR] Error procesando fila ${filaActual}: ${errFila.message}`);
      }

      filaActual++;
    }

    // Al finalizar todas las filas: eliminar el cursor y purgar triggers residuales
    props.deleteProperty(claveEstado);
    this.limpiarTriggersResiduales(nombreFuncionReanudacion);
    console.info('[CHUNKING_COMPLETED] Tarea masiva culminada exitosamente para la totalidad de registros.');
  },

  /**
   * Purgador de triggers instalables temporales huérfanos.
   * @param {string} nombreFuncion
   */
  limpiarTriggersResiduales: function (nombreFuncion) {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
      if (t.getHandlerFunction() === nombreFuncion) {
        try {
          ScriptApp.deleteTrigger(t);
        } catch (_) {}
      }
    });
  }
});
```

---

## 4. Comparativa de Almacenes de Estado: `PropertiesService` vs `CacheService`

| Criterio | `PropertiesService` (Persistente) | `CacheService` (Memoria Volátil) |
| :--- | :--- | :--- |
| **Persistencia** | Permanente hasta que sea eliminada explícitamente. | Volátil. Se purga automáticamente al expirar el TTL. |
| **Tiempo de Vida (TTL)** | Indefinido. | Máximo **21.600 segundos (6 horas)**. |
| **Límite por Valor** | **Máximo 9 KB** por propiedad. | **Máximo 100 KB** por clave. |
| **Límite Total de Almacén** | **500 KB** por almacén (ScriptProperties). | Varios MB compartidos. |
| **Uso en Chunking** | **MANDATORIO PARA CURSORES**. Si la caché se purga, el cursor se pierde y la tarea se reinicia desde cero. | Adecuado para almacenar cachés temporales de catálogos y mapas de columnas. |
