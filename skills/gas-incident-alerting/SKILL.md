---
name: gas-incident-alerting
description: >-
  Alertas de incidentes críticos en Google Apps Script mediante Webhooks de Google Chat y correo:
  payload estructurado, deduplicación (debounce), redacción de datos sensibles y no-bloqueo del flujo principal.
---

# Alertas de Incidentes vía Webhook (`gas-incident-alerting`)

Notificación automatizada de fallos no recuperables en triggers, Web Apps y procesos en segundo plano hacia un espacio de **Google Chat** (webhook entrante) y/o correo.

---

## 1. Principios

1. **El notificador nunca debe romper el flujo principal**: toda su lógica va en `try/catch` y no relanza.
2. **No filtrar datos sensibles**: no enviar payloads HTTP completos, tokens, correos personales ni datos de negocio; incluir solo identificadores técnicos (módulo, fila, consecutivo).
3. **Deduplicar (debounce)**: un error repetitivo en un bucle puede generar cientos de mensajes. Usar `CacheService` para suprimir repeticiones iguales durante una ventana.
4. **La URL del webhook es un secreto**: guardarla en `ScriptProperties` (`CHAT_WEBHOOK_URL`); quien la conoce puede publicar en el espacio.
5. Distinguir entorno (`DEVELOPMENT` / `PRODUCTION`) en el mensaje.

---

## 2. Implementación

```javascript
/**
 * Notifica un incidente crítico a Google Chat sin interrumpir el flujo llamador.
 *
 * @param {string} modulo - Módulo o servicio donde ocurrió el fallo.
 * @param {Error|string} error - Error capturado.
 * @param {Object.<string, (string|number)>} [contexto] - Identificadores técnicos no sensibles.
 * @returns {void}
 */
function notificarIncidenteCritico(modulo, error, contexto) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhookUrl = props.getProperty('CHAT_WEBHOOK_URL');
    if (!webhookUrl) {
      console.warn('CHAT_WEBHOOK_URL no configurada; alerta omitida.');
      return;
    }

    const mensaje = error instanceof Error ? error.message : String(error);

    // Debounce: misma firma (módulo + mensaje) solo una vez cada 10 minutos
    const firma = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, modulo + '|' + mensaje)
    );
    const cache = CacheService.getScriptCache();
    if (cache.get('ALERTA_' + firma)) return;
    cache.put('ALERTA_' + firma, '1', 600);

    const entorno = props.getProperty('ENVIRONMENT') || 'DEVELOPMENT';
    const traza = error instanceof Error && error.stack ? error.stack.substring(0, 1500) : '';

    const texto =
      '*Incidente crítico en Apps Script*\n' +
      '*Entorno:* ' + entorno + '\n' +
      '*Módulo:* ' + modulo + '\n' +
      '*Hora:* ' + new Date().toISOString() + '\n' +
      '*Error:* ' + mensaje.substring(0, 500) + '\n' +
      (traza ? '```' + traza + '```\n' : '') +
      (contexto ? '*Contexto:* ```' + JSON.stringify(contexto) + '```' : '');

    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: texto }),
      muteHttpExceptions: true
    });
  } catch (errorNotificador) {
    console.error('Fallo al notificar incidente: ' + errorNotificador.message);
  }
}
```

---

## 3. Canal de Respaldo por Correo

Si el webhook no está disponible, enviar un resumen con `MailApp` (scope `https://www.googleapis.com/auth/script.send_mail`). Verificar antes `MailApp.getRemainingDailyQuota()` para no agotar la cuota diaria de correos con una tormenta de alertas.

```javascript
function notificarPorCorreoSoporte_(asunto, cuerpoTexto) {
  const destino = PropertiesService.getScriptProperties().getProperty('CORREO_SOPORTE');
  if (!destino || MailApp.getRemainingDailyQuota() < 5) return;
  MailApp.sendEmail({ to: destino, subject: asunto, body: cuerpoTexto });
}
```

---

## 4. Uso en Puntos de Entrada

```javascript
function handleInstalledEdit(e) {
  try {
    App.Services.Gestion.procesarMutacionCelda(e);
  } catch (error) {
    notificarIncidenteCritico('handleInstalledEdit', error, { hoja: e && e.range && e.range.getSheet().getName(), fila: e && e.range && e.range.getRow() });
    throw error; // conservar el fallo visible en Executions
  }
}
```

