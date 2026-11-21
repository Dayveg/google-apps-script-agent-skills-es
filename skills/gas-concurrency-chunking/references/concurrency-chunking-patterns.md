# Patrones de Referencia — Concurrencia y Job Chunking (`gas-concurrency-chunking`)

Implementaciones canónicas de `LockManager` con *Decorrelated Jitter* y `ChunkingProcessor` con persistencia de cursor en `PropertiesService`.

---

## 1. `LockManager` con Retroceso Exponencial y *Decorrelated Jitter*

$$\text{Retraso} = \min\left(T_{\max}, \text{Uniforme}\left(T_{\text{base}}, \text{RetrasoPrevio} \times 3\right)\right)$$

```javascript
/**
 * @fileoverview Gestor transaccional de concurrencia con LockService y Decorrelated Jitter.
 */
const LockManager = Object.freeze({
  /**
   * Ejecuta una unidad de trabajo bajo exclusión mutua con dispersión de contención.
   *
   * @param {Function} operacionTransaccional - Callback sin parámetros que contiene la lógica atómica.
   * @param {Object} [opciones={}]
   * @param {number} [opciones.tiempoEsperaPorIntentoMs=10000] - Máximo por intento (tope 30000).
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

      if (intento < config.maxIntentos) {
        const techo = Math.min(config.maxDelayMs, retrasoActual * 3);
        const tiempoDormir = Math.floor(Math.random() * (techo - config.baseDelayMs + 1)) + config.baseDelayMs;
        retrasoActual = tiempoDormir;

        console.info(`[LOCK_CONTENCION] Intento ${intento}/${config.maxIntentos} fallido. Esperando ${tiempoDormir}ms...`);
        Utilities.sleep(tiempoDormir);
      }
    }

    if (!bloqueoAdquirido) {
      return Response.fail(
        'Alta contención de concurrencia. Por favor reintente en unos segundos.',
        'CONCURRENCY_CONTENTION_ERROR'
      );
    }

    try {
      const resultado = operacionTransaccional();
      SpreadsheetApp.flush();
      return Response.ok(resultado);
    } catch (errorOperacion) {
      console.error('[TRANSACCION_ERROR] Fallo en sección crítica: ' + errorOperacion.message);
      return Response.fail('Error en operación protegida: ' + errorOperacion.message, 'TRANSACTION_EXECUTION_ERROR');
    } finally {
      try {
        lock.releaseLock();
      } catch (errRelease) {
        console.warn('[LOCK_RELEASE_WARN] No se pudo liberar cerrojo: ' + errRelease.message);
      }
    }
  }
});
```

---

## 2. `ChunkingProcessor` para Procesos > 4.5 Minutos

```javascript
/**
 * @fileoverview Motor de procesamiento masivo tolerante a límites de tiempo de 6 minutos.
 */
const ChunkingProcessor = Object.freeze({
  /**
   * Procesa una lista masiva dividiendo la carga entre ejecuciones temporizadas.
   *
   * @param {string} claveEstado - Clave en PropertiesService para guardar el cursor.
   * @param {string} nombreFuncionReanudacion - Nombre de la función global del trigger.
   * @param {Function} procesarFilaCallback - Función que procesa un índice de fila: fn(numeroFila).
   * @returns {void}
   */
  ejecutarLoteConAutoReanudacion: function (claveEstado, nombreFuncionReanudacion, procesarFilaCallback) {
    const TIEMPO_INICIO = Date.now();
    const LIMITE_SEGURIDAD_MS = 270000;
    const props = PropertiesService.getScriptProperties();

    const libro = SpreadsheetApp.getActive();
    const hoja = libro.getSheetByName('Gestion');
    const totalFilas = hoja.getLastRow();

    let filaActual = parseInt(props.getProperty(claveEstado) || '2', 10);
    console.info(`[CHUNKING_START] Iniciando procesamiento desde fila ${filaActual} de ${totalFilas}.`);

    while (filaActual <= totalFilas) {
      if (Date.now() - TIEMPO_INICIO > LIMITE_SEGURIDAD_MS) {
        console.warn(`[CHUNKING_TIMEOUT_SHIELD] Umbral de 4.5 min alcanzado. Cursor en fila ${filaActual}.`);
        props.setProperty(claveEstado, String(filaActual));

        ScriptApp.newTrigger(nombreFuncionReanudacion)
          .timeBased()
          .after(60 * 1000)
          .create();

        return;
      }

      try {
        procesarFilaCallback(filaActual);
      } catch (errFila) {
        console.error(`[CHUNKING_ROW_ERROR] Fila ${filaActual}: ${errFila.message}`);
      }

      filaActual++;
    }

    props.deleteProperty(claveEstado);
    this.limpiarTriggersResiduales(nombreFuncionReanudacion);
    console.info('[CHUNKING_COMPLETED] Tarea masiva culminada exitosamente.');
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
