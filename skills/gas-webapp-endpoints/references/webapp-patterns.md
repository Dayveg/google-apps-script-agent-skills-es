# Patrones de Referencia — Web Apps y Endpoints REST (`gas-webapp-endpoints`)

Implementaciones canónicas para `doPost`, `doGet`, validación institucional *fail-closed* y cliente `fetch()` sin errores CORS/302.

---

## 1. Estructura del Objeto de Evento HTTP (`e`)

```javascript
{
  queryString: "action=buscar&id=123",
  parameter: { action: "buscar", id: "123" },
  parameters: { action: ["buscar"], id: ["123"] },
  contextPath: "",
  contentLength: 45,
  postData: {
    length: 45,
    type: "application/json",
    name: "postData",
    contents: '{"action":"REGISTRAR_NOVEDAD","fila":45}'
  }
}
```

---

## 2. Controlador Canónico `doPost` con Validación Institucional

```javascript
/**
 * Controlador de entrada HTTP POST para la Web App.
 *
 * @param {GoogleAppsScript.Events.DoPost} e - Objeto de evento HTTP POST.
 * @returns {GoogleAppsScript.Content.TextOutput} Respuesta serializada en formato JSON.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return emitirRespuestaJson_(Response.fail('Cuerpo de la petición HTTP vacío o malformado.', 'BAD_REQUEST'));
    }

    let payload;
    const contentType = String(e.postData.type || '').toLowerCase();

    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errJson) {
        return emitirRespuestaJson_(Response.fail('JSON inválido en el cuerpo: ' + errJson.message, 'INVALID_JSON'));
      }
    } else {
      payload = e.parameter || {};
    }

    const validacionAcceso = validarAccesoInstitucional_();
    if (!validacionAcceso.autorizado) {
      return emitirRespuestaJson_(Response.fail(validacionAcceso.error, 'FORBIDDEN'));
    }

    const accion = String(payload.action || payload.accion || '').trim();
    if (!accion) {
      return emitirRespuestaJson_(Response.fail('No se especificó ninguna acción en el payload.', 'MISSING_ACTION'));
    }

    const resultado = App.Controllers.Api.despachar(accion, payload.data || payload);
    return emitirRespuestaJson_(resultado);
  } catch (errorFatal) {
    console.error('[FATAL_doPost] Excepción crítica: ' + errorFatal.message);
    return emitirRespuestaJson_(Response.fail('Error interno no controlado: ' + errorFatal.message, 'INTERNAL_SERVER_ERROR'));
  }
}

/**
 * Emite una respuesta estructurada con cabecera application/json.
 * @private
 * @param {ServiceResponse} respuesta
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function emitirRespuestaJson_(respuesta) {
  return ContentService.createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Valida que el usuario pertenezca al dominio institucional autorizado (fail-closed).
 * @private
 * @returns {{autorizado: boolean, error: string|null}}
 */
function validarAccesoInstitucional_() {
  let email = '';
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    }
  } catch (_) {}

  if (!email || !email.includes('@')) {
    return { autorizado: false, error: 'Usuario no autenticado o no identificable.' };
  }

  const DOMINIO_REQUERIDO = PropertiesService.getScriptProperties().getProperty('WEBAPP_ALLOWED_DOMAIN');
  if (!DOMINIO_REQUERIDO) {
    return { autorizado: false, error: 'WEBAPP_ALLOWED_DOMAIN no está configurado.' };
  }
  if (!email.endsWith(`@${DOMINIO_REQUERIDO}`)) {
    return {
      autorizado: false,
      error: `Acceso restringido: Solo se permiten usuarios del dominio @${DOMINIO_REQUERIDO}.`
    };
  }

  return { autorizado: true, error: null };
}
```

---

## 3. Controlador Canónico `doGet`

```javascript
/**
 * Controlador de entrada HTTP GET.
 * Sirve interfaces HTML o responde a consultas tipo API REST.
 *
 * @param {GoogleAppsScript.Events.DoGet} e - Objeto de evento HTTP GET.
 * @returns {GoogleAppsScript.HTML.HtmlOutput|GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.format === 'json') {
      const criterio = String(e.parameter.q || '').trim();
      const resultado = App.Services.Consultas.buscar(criterio);
      return emitirRespuestaJson_(resultado);
    }

    const template = HtmlService.createTemplateFromFile('Index');
    template.tituloPortal = 'Portal Corporativo — Google Workspace';

    return template.evaluate()
      .setTitle('Portal Corporativo')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput(
      `<div style="font-family: sans-serif; padding: 20px; color: #721c24; background-color: #f8d7da;">
        <h2>Error al inicializar la aplicación Web</h2>
        <p>${error.message}</p>
      </div>`
    );
  }
}
```

---

## 4. Cliente `fetch()` sin Errores CORS / 302

```javascript
fetch(webAppUrl, {
  method: 'POST',
  mode: 'cors',
  redirect: 'follow',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Evita preflights OPTIONS en GAS
  body: JSON.stringify(payload)
})
  .then((res) => res.json())
  .then((data) => console.log('Respuesta recibida:', data));
```
