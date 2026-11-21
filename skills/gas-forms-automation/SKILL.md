---
name: gas-forms-automation
description: >-
  Automatización de Google Forms con FormApp y procesamiento transaccional de eventos onFormSubmit
  (Spreadsheet Event e.namedValues vs Form Event e.response): sanitización OWASP, consecutivos y sincronización de listas.
  Usar cuando: se procesen respuestas de Google Forms (onFormSubmit) o se actualicen opciones de formularios con FormApp en GAS.
  NO usar cuando: se procesen formularios HTML propios en Web Apps (usar gas-htmlservice-ui o gas-webapp-endpoints).
---

# Automatización de Google Forms y `onFormSubmit` (`gas-forms-automation`)

Estándares para procesar envíos de **Google Forms** sin pérdida de datos por concurrencia ni acoplamiento a posiciones de preguntas, y para sincronizar opciones dinámicas con **`FormApp`**.

---

## 1. Diferencia Crítica entre los Dos Eventos `onFormSubmit`

Google Apps Script ofrece dos disparadores instalables `onFormSubmit` con estructuras de evento completamente distintas:

| Origen del Trigger | Creación en `ScriptApp` | Propiedades del Evento `e` | Cuándo Usarlo |
| :--- | :--- | :--- | :--- |
| **Hoja de Cálculo destino** | `ScriptApp.newTrigger(fn).forSpreadsheet(ss).onFormSubmit()` | `e.namedValues` (`{'Pregunta': ['Valor']}`), `e.values`, `e.range` | **Recomendado** cuando las respuestas se consolidan en Sheets y se requiere escribir consecutivo/estado en la fila insertada (`e.range.getRow()`). |
| **Formulario nativo** | `ScriptApp.newTrigger(fn).forForm(form).onFormSubmit()` | `e.response` (`FormResponse`), `e.source` (`Form`) | Cuando no hay hoja vinculada o se necesitan adjuntos/metadatos directos del formulario (`getItemResponses()`). |

---

## 2. Reglas Obligatorias en `onFormSubmit`

1. **Usar `e.namedValues` en lugar de `e.values[i]`**: si alguien reordena preguntas en el formulario, `e.values[i]` lee el campo equivocado.
2. **Sanitizar toda entrada contra *Formula Injection*** (`sanitizarEntradaTexto`) y adquirir `LockService.getScriptLock()` antes de asignar consecutivos o escribir en la fila `e.range.getRow()`.
3. **Respetar las filas insertadas por Forms**: Google Forms inserta una fila nueva desplazando referencias; nunca usar fórmulas estáticas por fila en la pestaña de respuestas, sino escribir los valores calculados desde el trigger o usar `ARRAYFORMULA` en el encabezado.

---

## 3. Controlador Canónico `handleFormSubmit` (en Sheets)

```javascript
/**
 * Procesa de forma transaccional un envío de Google Forms vinculado a una hoja.
 *
 * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e - Evento onFormSubmit de Sheets.
 * @returns {ServiceResponse}
 */
function handleFormSubmit(e) {
  if (!e || !e.range || !e.namedValues) {
    return Response.fail('Evento onFormSubmit inválido o ejecutado manualmente.');
  }

  return LockManager.ejecutarTransaccion(() => {
    const hoja = e.range.getSheet();
    const fila = e.range.getRow();
    const cols = SheetTableMapper.obtenerIndicesColumnas(hoja);

    const correo = String((e.namedValues['Dirección de correo electrónico'] || [''])[0]).trim();
    const asuntoRaw = String((e.namedValues['Asunto de la solicitud'] || [''])[0]);
    const asuntoSeguro = sanitizarEntradaTexto(asuntoRaw);

    const consecutivo = `RAD-${new Date().getFullYear()}-${String(fila - 1).padStart(5, '0')}`;

    if (cols['CONSECUTIVO']) {
      hoja.getRange(fila, cols['CONSECUTIVO']).setValue(consecutivo);
    }
    if (cols['ASUNTO']) {
      hoja.getRange(fila, cols['ASUNTO']).setValue(asuntoSeguro);
    }
    if (cols['ESTADO']) {
      hoja.getRange(fila, cols['ESTADO']).setValue('RADICADO');
    }

    return { fila: fila, consecutivo: consecutivo, correo: correo };
  });
}
```
