---
name: gas-triggers-lifecycle
description: >-
  Gobierno del ciclo de vida de disparadores (Triggers): diferencias entre triggers simples e instalables,
  control de ScriptApp.AuthMode, prevención de doble ejecución, cuotas (máx. 20) y registro idempotente.
  Usar cuando: se creen o depuren triggers onOpen, onEdit, onFormSubmit o timeBased() en Google Apps Script.
  NO usar cuando: se configuren cron jobs de Linux, GitHub Actions o Cloud Scheduler fuera de GAS.
---

# Ciclo de Vida y Disparadores Oficiales (`gas-triggers-lifecycle`)

Esta especificación técnica detalla los patrones de ingeniería oficiales para gobernar el ciclo de vida de los **disparadores simples, instalables y basados en tiempo** en Google Apps Script, conforme a la documentación canónica de [Google Workspace Triggers](https://developers.google.com/apps-script/guides/triggers).

---

## 1. Matriz de Autorización Oficial (`ScriptApp.AuthMode`)

Google Apps Script ejecuta cada función de disparador bajo un contexto de seguridad estricto que determina qué APIs pueden ser invocadas:

| Modo de Autorización | Origen de la Invocación | Servicios Permitidos | Servicios Prohibidos |
| :--- | :--- | :--- | :--- |
| **`AuthMode.NONE`** | Documento abierto por usuario anónimo / sin sesión. | Ninguno. Acceso de solo lectura nulo. | Cualquier llamada a Google APIs falla de inmediato. |
| **`AuthMode.CUSTOM_FUNCTION`** | Fórmula personalizada en celda (`=MI_FUNCION()`). | Cálculo en memoria, `CacheService`, `UrlFetchApp` (solo endpoints públicos sin credenciales de usuario). | `GmailApp`, `MailApp`, `DriveApp`, `SpreadsheetApp.openById()`, mutación de celdas o menús. |
| **`AuthMode.LIMITED`** | Disparadores simples (`onEdit`, `onOpen`). | Solo el archivo contenedor activo (`SpreadsheetApp.getActiveSpreadsheet()`). | `UrlFetchApp`, `GmailApp`, `DriveApp`, acceso a otros libros, `LockService.getScriptLock()`. |
| **`AuthMode.FULL`** | Disparadores instalables (`ScriptApp.newTrigger`) o ejecuciones desde menús de usuario. | **Acceso total** a todos los servicios y APIs autorizados por la cuenta instaladora. | Ninguno (sujeto a las cuotas normales del usuario). |

> [!CAUTION]
> Intentar invocar `UrlFetchApp.fetch()`, enviar un correo electrónico con `GmailApp` o consultar una hoja externa dentro de una función simple `onEdit(e)` lanzará una excepción fatal de permisos:
> `Exception: You do not have permission to call UrlFetchApp.fetch`.

---

## 2. El Antipatrón de la Doble Ejecución

Uno de los fallos más graves en proyectos de Google Apps Script es vincular un disparador instalable a una función nombrada `onEdit` o `onOpen`.

```
                    ┌───────────────────────────────┐
                    │  USUARIO EDITA CELDA EN HOJA  │
                    └───────────────┬───────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           │                                                 │
           ▼ (Ejecución Simple)                              ▼ (Ejecución Instalable)
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│       function onEdit(e)             │          │       Trigger Instalado: onEdit      │
│  • AuthMode.LIMITED                  │          │  • AuthMode.FULL                     │
│  • Identidad: Usuario activo         │          │  • Identidad: Administrador          │
│  • Límite: 30 segundos               │          │  • Límite: 6 minutos                 │
└──────────────────────────────────────┘          └──────────────────────────────────────┘
                   ⚡ AMBAS SE DISPARAN SIMULTÁNEAMENTE ⚡
```

### Regla Canónica de Nomenclatura:
* **Disparador Simple (Solo UI local rápida)**: `function onOpen(e)` o `function onEditSimple(e)`
* **Disparador Instalable (Negocio/Integraciones)**: `function handleInstalledEdit(e)` o `function handleInstalledChange(e)`

---

## 3. Gestor de Registro Idempotente de Triggers

Google impone una cuota estricta de **máximo 20 disparadores instalables por usuario por script**. La creación descontrolada de triggers genera fallos catastróficos. 

### Implementación del Administrador Idempotente:

```javascript
/**
 * @fileoverview Administrador del ciclo de vida de disparadores instalables.
 */

const TriggerManager = Object.freeze({
  /**
   * Asegura la existencia de un disparador instalable sin duplicarlo.
   *
   * @param {string} funcionDestino - Nombre de la función handler (ej. 'handleInstalledEdit').
   * @param {GoogleAppsScript.Script.EventType} tipoEvento - Tipo de evento (ON_EDIT, ON_CHANGE, ON_OPEN).
   * @returns {ServiceResponse}
   */
  asegurarTriggerSpreadsheet: function (funcionDestino, tipoEvento = ScriptApp.EventType.ON_EDIT) {
    try {
      const libro = SpreadsheetApp.getActive();
      if (!libro) {
        return Response.fail('No existe un libro contenedor activo para enlazar el disparador.');
      }

      const triggersActuales = ScriptApp.getProjectTriggers();

      // Verificar cuota de Google (Límite: 20 por usuario/script)
      if (triggersActuales.length >= 20) {
        return Response.fail('Límite de cuota alcanzado: Se superó el máximo de 20 triggers por script.', 'TRIGGER_QUOTA_EXCEEDED');
      }

      // Comprobar si ya existe un trigger para esta función y evento
      const yaRegistrado = triggersActuales.some(t => {
        return t.getHandlerFunction() === funcionDestino && t.getEventType() === tipoEvento;
      });

      if (yaRegistrado) {
        return Response.ok({ estado: 'EXISTE_PREVIAMENTE', funcion: funcionDestino });
      }

      // Crear constructor según el tipo de evento
      let builder = ScriptApp.newTrigger(funcionDestino).forSpreadsheet(libro);

      if (tipoEvento === ScriptApp.EventType.ON_EDIT) {
        builder = builder.onEdit();
      } else if (tipoEvento === ScriptApp.EventType.ON_CHANGE) {
        builder = builder.onChange();
      } else if (tipoEvento === ScriptApp.EventType.ON_OPEN) {
        builder = builder.onOpen();
      } else {
        return Response.fail('Tipo de evento de hoja no soportado.');
      }

      const nuevoTrigger = builder.create();

      return Response.ok({
        estado: 'CREADO_EXITOSAMENTE',
        idTrigger: nuevoTrigger.getUniqueId(),
        funcion: funcionDestino
      });

    } catch (error) {
      return Response.fail('Error al registrar disparador: ' + error.message, 'TRIGGER_CREATION_ERROR');
    }
  },

  /**
   * Elimina de forma segura todos los triggers vinculados a una función específica.
   *
   * @param {string} funcionDestino - Nombre de la función a desvincular.
   * @returns {ServiceResponse} Total de triggers eliminados.
   */
  eliminarTriggersPorFuncion: function (funcionDestino) {
    try {
      const triggers = ScriptApp.getProjectTriggers();
      let eliminados = 0;

      triggers.forEach(t => {
        if (t.getHandlerFunction() === funcionDestino) {
          ScriptApp.deleteTrigger(t);
          eliminados++;
        }
      });

      return Response.ok({ funcion: funcionDestino, totalEliminados: eliminados });
    } catch (error) {
      return Response.fail('Error al purgar disparadores: ' + error.message, 'TRIGGER_PURGE_ERROR');
    }
  }
});
```

---

## 4. Controlador de Evento Instalable con Filtros de Guardia

```javascript
/**
 * Punto de entrada oficial para el disparador instalable de edición de celdas.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - Objeto de evento nativo de Google Sheets.
 * @returns {void}
 */
function handleInstalledEdit(e) {
  // Guardia 1: Prevenir invocación manual sin evento
  if (!e || !e.range) {
    console.warn('[GUARD_ABORT] handleInstalledEdit invocado directamente sin objeto de evento.');
    return;
  }

  // Guardia 2: Validar modo de autorización FULL
  if (e.authMode !== ScriptApp.AuthMode.FULL) {
    console.error(`[GUARD_ABORT] Modo de autorización inválido: ${e.authMode}. Se requiere FULL.`);
    return;
  }

  const hoja = e.range.getSheet();
  const nombreHoja = hoja.getName();
  const fila = e.range.getRow();
  const columna = e.range.getColumn();

  // Guardia 3: Filtrar ediciones en encabezados (fila 1) o pestañas ajenas
  if (fila < 2 || nombreHoja !== 'Gestión') {
    return;
  }

  // Enrutar al servicio de dominio bajo cerrojo transaccional
  App.Services.Gestion.procesarMutacionCelda({
    hoja: hoja,
    fila: fila,
    columna: columna,
    valorNuevo: e.value !== undefined ? e.value : null,
    valorAnterior: e.oldValue !== undefined ? e.oldValue : null,
    usuario: e.user ? e.user.getEmail() : 'ANONIMO'
  });
}
```
