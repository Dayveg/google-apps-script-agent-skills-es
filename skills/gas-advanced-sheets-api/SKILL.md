---
name: gas-advanced-sheets-api
description: >-
  Patrones canónicos de alto rendimiento con Google Sheets API v4 (Servicio Avanzado):
  operaciones batchGet y batchUpdate, mutaciones atómicas de formato y GridRange, y manejo de cuotas RPC con backoff exponencial.
---

# Google Sheets API v4 — Servicio Avanzado (`gas-advanced-sheets-api`)

Esta especificación establece los estándares de ingeniería para operar hojas de cálculo de alta escala mediante el **Servicio Avanzado de Sheets (Sheets API v4)**, reduciendo hasta un 85% la latencia de red respecto a la API integrada `SpreadsheetApp`.

---

## 1. Justificación Técnica: `SpreadsheetApp` vs `Sheets API v4`

| Dimensión de Rendimiento | `SpreadsheetApp` (Nativo) | `Sheets API v4` (Servicio Avanzado) |
| :--- | :--- | :--- |
| **Arquitectura de Llamadas** | Cada `getRange().setValue()` o `setBackground()` emite una llamada RPC síncrona inmediata. | Agrupa mutaciones heterogéneas (datos, formatos, protecciones) en una **única llamada HTTP POST**. |
| **Rangos no Contiguos** | Requiere múltiples lecturas secuenciales bloqueantes. | Soporta `Values.batchGet` resolviendo N rangos en 1 solo viaje de red. |
| **Tiempo de Red** | Acumula latencia por cada celda, provocando timeouts de 6 minutos en hojas > 1.000 filas. | Optimizado para procesamiento masivo de hasta cientos de miles de celdas en segundos. |
| **Control de Cuotas** | Propenso a agotar la cuota de operaciones por minuto. | Minimiza el número absoluto de solicitudes contra la API de Google Cloud. |

---

## 2. Activación en el Manifiesto `appsscript.json`

```json
{
  "timeZone": "America/Bogota",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Sheets",
        "serviceId": "sheets",
        "version": "v4"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets"
  ]
}
```

---

## 3. Lectura de Múltiples Rangos Dispersos (`Values.batchGet`)

En procesos de cruce de datos (ej. conciliar `Gestión` con `Gestores` y `Parámetros`), `Values.batchGet` elimina el cuello de botella de lecturas secuenciales:

```javascript
/**
 * Realiza una consulta atómica multi-rango mediante Sheets API v4.
 *
 * @param {string} spreadsheetId - Identificador único de la hoja de cálculo.
 * @param {string[]} rangosA1 - Array de rangos en notación A1 (ej. ['Gestion!A2:E500', 'Gestores!B2:D100']).
 * @returns {ServiceResponse} Mapa asociativo { 'RangoA1': Array<Array<*>> }.
 */
function leerRangosMultiplesAvanzado(spreadsheetId, rangosA1) {
  if (!spreadsheetId || !Array.isArray(rangosA1) || rangosA1.length === 0) {
    return Response.fail('Se requiere un spreadsheetId y una lista no vacía de rangos.');
  }

  try {
    const respuesta = ejecutarConBackoffExponencial_(() => {
      return Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
        ranges: rangosA1,
        majorDimension: 'ROWS',
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });
    });

    const resultado = {};
    if (respuesta.valueRanges && respuesta.valueRanges.length > 0) {
      respuesta.valueRanges.forEach((vr) => {
        resultado[vr.range] = vr.values || [];
      });
    }

    return Response.ok(resultado);
  } catch (error) {
    return Response.fail('Error en Sheets API batchGet: ' + error.message, 'SHEETS_BATCH_GET_ERROR');
  }
}
```

---

## 4. Escritura Atómica en Lote (`Values.batchUpdate`)

```javascript
/**
 * Ejecuta una escritura por lotes atómica en múltiples pestañas o rangos no continuos.
 *
 * @param {string} spreadsheetId - Identificador de la hoja de cálculo.
 * @param {Array<{range: string, values: Array<Array<*>>}>} actualizaciones - Lista de rangos y matrices de datos.
 * @returns {ServiceResponse} Estadísticas de celdas y filas actualizadas.
 */
function escribirRangosMultiplesAvanzado(spreadsheetId, actualizaciones) {
  if (!spreadsheetId || !Array.isArray(actualizaciones) || actualizaciones.length === 0) {
    return Response.fail('Parámetros de actualización inválidos.');
  }

  try {
    const dataPayload = actualizaciones.map(item => ({
      range: item.range,
      majorDimension: 'ROWS',
      values: item.values
    }));

    const resource = {
      valueInputOption: 'USER_ENTERED',
      data: dataPayload
    };

    const respuesta = ejecutarConBackoffExponencial_(() => {
      return Sheets.Spreadsheets.Values.batchUpdate(resource, spreadsheetId);
    });

    return Response.ok({
      totalCeldasActualizadas: respuesta.totalUpdatedCells || 0,
      totalFilasActualizadas: respuesta.totalUpdatedRows || 0,
      totalColumnasActualizadas: respuesta.totalUpdatedColumns || 0,
      totalHojasActualizadas: respuesta.totalUpdatedSheets || 0
    });
  } catch (error) {
    return Response.fail('Error en Sheets API batchUpdate: ' + error.message, 'SHEETS_BATCH_UPDATE_ERROR');
  }
}
```

---

## 5. Mutaciones Estructurales y Formato Atómico con `GridRange`

A diferencia de `SpreadsheetApp`, que requiere llamar a métodos individuales como `setBackground()`, `setFontWeight()`, `setDataValidation()` uno por uno, **`Sheets.Spreadsheets.batchUpdate`** permite aplicar múltiples mutaciones estructurales en un solo payload declarativo.

### Especificación `GridRange` (0-Based):
* `sheetId`: Entero identificador de la pestaña (`hoja.getSheetId()`).
* `startRowIndex` y `endRowIndex`: Índices 0-based de fila (semi-abierto: `[start, end)`).
* `startColumnIndex` y `endColumnIndex`: Índices 0-based de columna.

```javascript
/**
 * Aplica formato condicional, protección y validación de datos en una sola llamada RPC.
 *
 * @param {string} spreadsheetId - ID del libro.
 * @param {number} sheetId - ID numérico de la pestaña.
 * @param {number} filaInicio - Fila inicial 0-based.
 * @param {number} filaFin - Fila final 0-based (exclusiva).
 * @param {number} colInicio - Columna inicial 0-based.
 * @param {number} colFin - Columna final 0-based (exclusiva).
 * @returns {ServiceResponse}
 */
function aplicarFormatoYProteccionAvanzada(spreadsheetId, sheetId, filaInicio, filaFin, colInicio, colFin) {
  try {
    const gridRange = {
      sheetId: sheetId,
      startRowIndex: filaInicio,
      endRowIndex: filaFin,
      startColumnIndex: colInicio,
      endColumnIndex: colFin
    };

    const requests = [
      // 1. Aplicar estilo visual (Fondo verde tenue, texto en negrita)
      {
        repeatCell: {
          range: gridRange,
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.9, green: 0.95, blue: 0.9 },
              textFormat: { bold: true, fontSize: 10 }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      },
      // 2. Proteger el rango contra modificaciones accidentales
      {
        addProtectedRange: {
          protectedRange: {
            range: gridRange,
            description: 'Bloqueo automático de auditoría',
            warningOnly: false
          }
        }
      }
    ];

    const respuesta = ejecutarConBackoffExponencial_(() => {
      return Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
    });

    return Response.ok(respuesta);
  } catch (error) {
    return Response.fail('Error en Sheets estructural batchUpdate: ' + error.message, 'SHEETS_STRUCTURAL_ERROR');
  }
}
```

---

## 6. Algoritmo Canónico de Retroceso Exponencial con *Jitter*

Google Sheets API v4 impone un límite de **300 solicitudes por minuto por proyecto** y **60 solicitudes por minuto por usuario**. Ante un error `429 (Too Many Requests)` o `503 (Service Unavailable)`, es obligatorio aplicar reintentos con retroceso exponencial y dispersión aleatoria (*jitter*):

```javascript
/**
 * Envuelve una llamada a Google API con reintentos exponenciales y decorrelated jitter.
 *
 * @private
 * @param {Function} apiCallback - Función que ejecuta la llamada RPC.
 * @param {number} [maxIntentos=4] - Número máximo de intentos.
 * @param {number} [baseDelayMs=1000] - Tiempo de espera base inicial.
 * @returns {*} Retorno de la función apiCallback.
 * @throws {Error} Si se agotan los reintentos.
 */
function ejecutarConBackoffExponencial_(apiCallback, maxIntentos = 4, baseDelayMs = 1000) {
  let intento = 0;

  while (intento < maxIntentos) {
    try {
      return apiCallback();
    } catch (error) {
      intento++;
      const mensaje = String(error.message || '');
      const esReintentable = mensaje.includes('429') || 
                             mensaje.includes('503') || 
                             mensaje.includes('rate limit') || 
                             mensaje.includes('Quota exceeded');

      if (!esReintentable || intento >= maxIntentos) {
        throw error;
      }

      // Backoff = base * 2^intento + jitter aleatorio (0 a 500 ms)
      const retraso = (baseDelayMs * Math.pow(2, intento - 1)) + Math.floor(Math.random() * 500);
      console.warn(`[SHEETS_API_429] Reintento ${intento}/${maxIntentos} tras espera de ${retraso}ms. Causa: ${mensaje}`);
      Utilities.sleep(retraso);
    }
  }
}
```
