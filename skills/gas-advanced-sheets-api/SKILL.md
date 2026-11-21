---
name: gas-advanced-sheets-api
description: >-
  Patrones canónicos de alto rendimiento con Google Sheets API v4 (Servicio Avanzado):
  operaciones batchGet y batchUpdate, mutaciones atómicas de formato y GridRange, y manejo de cuotas RPC con backoff exponencial.
  Usar cuando: se realicen lecturas/escrituras masivas, formato complejo o múltiples rangos en Google Sheets desde GAS.
  NO usar cuando: se use gspread/googleapis en Python/Node.js fuera de GAS o basten operaciones simples en un único rango.
---

# Google Sheets API v4 — Servicio Avanzado (`gas-advanced-sheets-api`)

Directrices para operar hojas de cálculo de alta escala mediante el **Servicio Avanzado de Sheets (Sheets API v4)**, agrupando lecturas/escrituras y formatos en llamadas RPC únicas.

Para implementaciones completas (`appsscript.json`, `Values.batchGet`, `Values.batchUpdate`, `GridRange` y backoff con *jitter*), consultar [`references/sheets-v4-patterns.md`](./references/sheets-v4-patterns.md).

---

## 1. Cuándo Elegir `Sheets API v4` sobre `SpreadsheetApp`

| Dimensión | `SpreadsheetApp` (Nativo) | `Sheets API v4` (Avanzado) |
| :--- | :--- | :--- |
| **Llamadas RPC** | 1 llamada por cada `getRange().setValue()` o `setBackground()`. | Agrupa datos, formatos y protecciones en **1 sola llamada HTTP POST**. |
| **Rangos dispersos** | Múltiples lecturas secuenciales bloqueantes. | `Values.batchGet` resuelve N rangos en 1 solo viaje de red. |
| **Escala** | Propenso a timeout de 6 min en hojas > 1.000 filas. | Procesa cientos de miles de celdas en segundos. |

---

## 2. Reglas Obligatorias

1. **Habilitar servicio en `appsscript.json`**: declarar `enabledAdvancedServices` con `"serviceId": "sheets"`, `"version": "v4"`.
2. **Lecturas multi-rango**: usar `Sheets.Spreadsheets.Values.batchGet` con `valueRenderOption: 'UNFORMATTED_VALUE'`.
3. **Escrituras multi-rango**: usar `Sheets.Spreadsheets.Values.batchUpdate` con `valueInputOption: 'USER_ENTERED'`.
4. **Formato y protecciones atómicas**: usar `Sheets.Spreadsheets.batchUpdate` con `GridRange` **0-based** (`[start, end)` exclusivo en el fin).
5. **Control de cuotas (300 req/min proyecto, 60 req/min usuario)**: envolver toda llamada RPC en backoff exponencial con *jitter* ante `429` o `503`.

---

## 3. Checklist de Verificación

- `appsscript.json` declara el servicio avanzado `sheets` `v4` y scope mínimo necesario.
- Los índices `GridRange` son **0-based** y semi-abiertos `[start, end)`.
- Todas las llamadas están envueltas en reintentos exponenciales y retornan `ServiceResponse`.
