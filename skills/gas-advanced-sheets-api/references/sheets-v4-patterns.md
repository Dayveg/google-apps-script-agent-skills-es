# Patrones de Referencia — Google Sheets API v4 (`gas-advanced-sheets-api`)

Implementaciones canónicas para `Values.batchGet`, `Values.batchUpdate`, `GridRange` y backoff exponencial con *jitter*.

---

## 1. Activación en `appsscript.json`

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

## 2. Lectura de Múltiples Rangos Dispersos (`Values.batchGet`)

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

## 3. Escritura Atómica en Lote (`Values.batchUpdate`)

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

## 4. Mutaciones Estructurales y Formato Atómico (`GridRange` 0-Based)

- `sheetId`: `hoja.getSheetId()`
- `startRowIndex` / `endRowIndex`: Índices 0-based semi-abiertos `[start, end)`.
- `startColumnIndex` / `endColumnIndex`: Índices 0-based semi-abiertos `[start, end)`.

```javascript
/**
 * Aplica formato y protección de datos en una sola llamada RPC.
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

## 5. Retroceso Exponencial con *Jitter*

```javascript
/**
 * Envuelve una llamada a Google API con reintentos exponenciales y jitter.
 *
 * @private
 * @param {Function} apiCallback - Función que ejecuta la llamada RPC.
 * @param {number} [maxIntentos=4] - Número máximo de intentos.
 * @param {number} [baseDelayMs=1000] - Tiempo de espera base inicial.
 * @returns {*} Retorno de la función apiCallback.
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

      const retraso = (baseDelayMs * Math.pow(2, intento - 1)) + Math.floor(Math.random() * 500);
      console.warn(`[SHEETS_API_429] Reintento ${intento}/${maxIntentos} tras espera de ${retraso}ms. Causa: ${mensaje}`);
      Utilities.sleep(retraso);
    }
  }
}
```
