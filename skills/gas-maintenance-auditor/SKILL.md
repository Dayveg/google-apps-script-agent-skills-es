---
name: gas-maintenance-auditor
description: >-
  Auditoría programada de integridad en Google Sheets con Apps Script: duplicados, fórmulas dañadas,
  filas fantasma, marcas de tiempo faltantes y alertas de SLA, con reportes sin borrado a ciegas.
---

# Auditoría y Mantenimiento Programado (`gas-maintenance-auditor`)

Procedimiento para auditar periódicamente la integridad de hojas de cálculo operativas mediante un **trigger basado en tiempo** (`ScriptApp.newTrigger().timeBased().atHour(h).everyDays(1)`).

---

## 1. Principios

1. **Auditar y reportar primero; corregir solo reglas inequívocas.** Nunca borrar datos a ciegas: reportar filas afectadas para decisión humana.
2. **Idempotencia**: ejecutar dos veces no debe producir efectos distintos.
3. **Lectura en lote**: una sola lectura `getValues()` por hoja y análisis en memoria con `Map`/`Set`.
4. **Tolerar el límite de 6 minutos**: usar el patrón de *chunking* (skill `gas-concurrency-chunking`) si la hoja es grande.
5. **Cerrojo**: ejecutar bajo `LockService` para no competir con ediciones de usuarios.
6. Producir un **informe consolidado** (correo + alerta) con conteo de hallazgos; si no hay hallazgos, certificar estado óptimo.

---

## 2. Registro Idempotente del Trigger Diario

```javascript
/**
 * Crea el trigger de auditoría diaria solo si no existe.
 * @param {number} [hora=5] - Hora local del script (0-23).
 * @returns {ServiceResponse}
 */
function asegurarTriggerAuditoriaDiaria(hora = 5) {
  const existe = ScriptApp.getProjectTriggers()
    .some((t) => t.getHandlerFunction() === 'ejecutarAuditoriaDiaria');
  if (existe) return { success: true, data: { estado: 'EXISTE' }, error: null };

  ScriptApp.newTrigger('ejecutarAuditoriaDiaria')
    .timeBased()
    .atHour(hora)
    .everyDays(1)
    .create();
  return { success: true, data: { estado: 'CREADO' }, error: null };
}
```

> La hora real de disparo puede variar dentro de la franja de una hora; la zona horaria es la definida en `appsscript.json` (`timeZone`).

---

## 3. Detección de Duplicados (sin eliminar)

```javascript
/**
 * Reporta valores duplicados en una columna identificadora.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {string} nombreColumna - Encabezado de la columna a auditar.
 * @returns {ServiceResponse} data: Array<{valor: string, filas: number[]}>
 */
function auditarDuplicados(hoja, nombreColumna) {
  const mapaCols = obtenerMapaColumnas(hoja);
  const col = mapaCols[nombreColumna.toUpperCase()];
  if (!col) return { success: false, data: null, error: 'Columna no encontrada: ' + nombreColumna };

  const ultima = hoja.getLastRow();
  if (ultima < 2) return { success: true, data: [], error: null };

  const valores = hoja.getRange(2, col, ultima - 1, 1).getValues();
  const apariciones = new Map();
  valores.forEach((fila, i) => {
    const clave = String(fila[0]).trim();
    if (!clave) return;
    if (!apariciones.has(clave)) apariciones.set(clave, []);
    apariciones.get(clave).push(i + 2); // fila real en la hoja
  });

  const duplicados = [];
  apariciones.forEach((filas, valor) => {
    if (filas.length > 1) duplicados.push({ valor: valor, filas: filas });
  });
  return { success: true, data: duplicados, error: null };
}
```

---

## 4. Detección de Errores de Fórmula

```javascript
/**
 * Lista celdas con errores de fórmula (#REF!, #VALUE!, #N/A, #DIV/0!, #NAME?, #ERROR!).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @returns {ServiceResponse} data: Array<{fila: number, columna: number, error: string}>
 */
function auditarErroresFormula(hoja) {
  const rango = hoja.getDataRange();
  const valores = rango.getDisplayValues();
  const patron = /^#(REF!|VALUE!|N\/A|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!)/;
  const hallazgos = [];
  valores.forEach((fila, i) => {
    fila.forEach((celda, j) => {
      if (patron.test(celda)) hallazgos.push({ fila: i + 1, columna: j + 1, error: celda });
    });
  });
  return { success: true, data: hallazgos, error: null };
}
```

Para reparar fórmulas sobrescritas con texto, mantener un **catálogo de fórmulas canónicas** por columna y restaurarlas con `setFormula`/`setFormulas` solo en columnas declaradas como calculadas.

---

## 5. Filas Fantasma

Hojas con miles de filas vacías al final degradan `getLastRow()` y consumen el límite del libro (**20 millones de celdas** combinadas entre todas las pestañas o 100 MB, con un máximo de 18.278 columnas hasta `ZZZ`).

```javascript
/**
 * Elimina filas vacías sobrantes dejando un margen.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {number} [margen=50]
 */
function depurarFilasFantasma(hoja, margen = 50) {
  const ultimaConDatos = hoja.getLastRow();
  const total = hoja.getMaxRows();
  const sobrantes = total - (ultimaConDatos + margen);
  if (sobrantes > 0) hoja.deleteRows(ultimaConDatos + margen + 1, sobrantes);
}
```

---

## 6. Alerta de SLA

Calcular antigüedad de trámites por días hábiles (excluyendo fines de semana y festivos configurados en una hoja de parámetros) y reportar los que superen el umbral normativo definido por la organización.

---

## 7. Informe Consolidado

```javascript
function ejecutarAuditoriaDiaria() {
  const resultado = LockManager.ejecutarTransaccion(() => {
    const libro = SpreadsheetApp.getActive();
    const hallazgos = {
      duplicados: auditarDuplicados(libro.getSheetByName('Gestion'), 'CONSECUTIVO').data,
      formulas: auditarErroresFormula(libro.getSheetByName('Gestion')).data
    };
    const total = hallazgos.duplicados.length + hallazgos.formulas.length;
    return { total: total, hallazgos: hallazgos };
  });

  if (!resultado.success) {
    notificarIncidenteCritico('ejecutarAuditoriaDiaria', resultado.error);
    return;
  }
  const asunto = resultado.data.total === 0
    ? 'Auditoría diaria: sin hallazgos'
    : 'Auditoría diaria: ' + resultado.data.total + ' hallazgo(s)';
  MailApp.sendEmail(PropertiesService.getScriptProperties().getProperty('CORREO_SOPORTE'), asunto, JSON.stringify(resultado.data, null, 2));
}
```

