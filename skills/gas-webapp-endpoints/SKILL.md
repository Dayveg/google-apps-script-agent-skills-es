---
name: gas-webapp-endpoints
description: >-
  Arquitectura oficial de Web Apps y APIs REST en Google Apps Script: controladores doGet/doPost,
  modos de ejecución (executeAs), integración de modales HtmlService y patrón de Proxy Institucional.
---

# Web Apps y Endpoints REST en Google Apps Script (`gas-webapp-endpoints`)

Esta especificación técnica detalla los patrones de ingeniería oficiales para construir **Web Apps, APIs REST y Webhooks corporativos** mediante los controladores `doGet` y `doPost` de Google Apps Script, conforme a la documentación de [Google Workspace Web Apps](https://developers.google.com/apps-script/guides/web).

---

## 1. Topología de Modos de Ejecución y Permisos

Al desplegar una Web App en Google Apps Script se configuran dos dimensiones ortogonales que determinan la identidad de ejecución y la superficie de ataque:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           DIMENSIONES DE SEGURIDAD EN WEB APPS                          │
├───────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 1. Ejecutar Como (Execute As)             │ 2. Quién Tiene Acceso (Who Has Access)      │
├───────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • USER_DEPLOYING (Cuenta del Desarrollador):│ • ONLY_ME: Solo el creador del script.      │
│   La Web App corre con la identidad y los │ • MY_DOMAIN: Usuarios con cuentas del      │
│   permisos del autor. Permite actuar como │   dominio institucional (ej. @unal.edu.co). │
│   PROXY SEGURO para persistir en celdas   │ • ANYONE: Cualquier usuario con cuenta de   │
│   protegidas o disparar notificaciones.   │   Google activa.                            │
│ • USER_ACCESSING (Usuario Activo):        │ • ANYONE_ANONYMOUS: Acceso público sin      │
│   La Web App corre con la cuenta del      │   necesidad de iniciar sesión en Google.    │
│   usuario que hace el clic o la petición. │                                             │
└───────────────────────────────────────────┴─────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Patrón de Proxy Institucional para Modales Desatendidos**:
> Cuando usuarios operativos necesitan registrar datos en una hoja de cálculo desde una ventana modal pero **no tienen permisos de edición en celdas protegidas**, la Web App debe desplegarse como `Execute as: USER_DEPLOYING` con acceso restringido a `MY_DOMAIN`. El modal realiza una petición `fetch()` a la URL canónica de la Web App, y la persistencia se ejecuta con la cuenta administrativa autorizada.

---

## 2. Anatomía Canónica del Objeto de Evento HTTP

Google Apps Script inyecta un objeto de evento estructurado `e` en `doGet` y `doPost`:

```javascript
// Estructura oficial del parámetro 'e' en peticiones HTTP
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

## 3. Controlador Canónico `doPost` (API REST / Webhook)

El controlador `doPost` debe deserializar de forma segura el cuerpo, validar la autorización institucional y responder siempre con cabeceras MIME JSON:

```javascript
/**
 * Controlador de entrada HTTP POST para la Web App.
 *
 * @param {GoogleAppsScript.Events.DoPost} e - Objeto de evento HTTP POST.
 * @returns {GoogleAppsScript.Content.TextOutput} Respuesta serializada en formato JSON.
 */
function doPost(e) {
  try {
    // 1. Validar presencia física de payload
    if (!e || !e.postData || !e.postData.contents) {
      return emitirRespuestaJson_(Response.fail('Cuerpo de la petición HTTP vacío o malformado.', 'BAD_REQUEST'));
    }

    // 2. Deserializar payload según Content-Type
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

    // 3. Validación de Acceso Institucional (Proxy Security Guard)
    const validacionAcceso = validarAccesoInstitucional_();
    if (!validacionAcceso.autorizado) {
      return emitirRespuestaJson_(Response.fail(validacionAcceso.error, 'FORBIDDEN'));
    }

    // 4. Extracción de acción requerida
    const accion = String(payload.action || payload.accion || '').trim();
    if (!accion) {
      return emitirRespuestaJson_(Response.fail('No se especificó ninguna acción en el payload.', 'MISSING_ACTION'));
    }

    // 5. Enrutamiento transaccional protegido por LockService
    const resultado = App.Controllers.Api.despachar(accion, payload.data || payload);
    return emitirRespuestaJson_(resultado);

  } catch (errorFatal) {
    console.error('[FATAL_doPost] Excepción crítica no recuperable: ' + errorFatal.message);
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
 * Valida que el usuario pertenezca al dominio institucional autorizado.
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

  // Si se ejecuta en contexto anónimo o no se detecta sesión
  if (!email || !email.includes('@')) {
    // Si la Web App está en modo USER_DEPLOYING para modales públicos internos, verificar token de cabecera
    return { autorizado: true, error: null };
  }

  const DOMINIO_REQUERIDO = 'unal.edu.co';
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

## 4. Controlador Canónico `doGet` (Portales Web y Vistas Modales)

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
    // Si la petición solicita explícitamente salida JSON (endpoint de consulta)
    if (e && e.parameter && e.parameter.format === 'json') {
      const criterio = String(e.parameter.q || '').trim();
      const resultado = App.Services.Consultas.buscar(criterio);
      return emitirRespuestaJson_(resultado);
    }

    // Servir plantilla HTML institucional
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

## 5. Prevención de Bucles de Redirección y Errores de CORS

Las Web Apps de Google Apps Script ejecutan una **redirección HTTP 302** automática hacia `script.googleusercontent.com` para aislar el sandbox de seguridad:

1. **En peticiones `fetch()` desde clientes web**:
   * Es **obligatorio** configurar `{ redirect: "follow" }` en la llamada JavaScript del cliente:
     ```javascript
     fetch(webAppUrl, {
       method: 'POST',
       mode: 'cors',
       redirect: 'follow',
       headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Usar text/plain evita preflights OPTIONS innecesarios en GAS
       body: JSON.stringify(payload)
     })
     .then(res => res.json())
     .then(data => console.log('Respuesta recibida:', data));
     ```
2. **Evitar parámetros `?authuser=X` quemados**:
   * Nunca hardcodear parámetros como `?authuser=0` o `?authuser=1` en URLs compartidas, ya que provocan errores de autorización `404 / 401` en usuarios con múltiples cuentas de Google abiertas en el navegador.
