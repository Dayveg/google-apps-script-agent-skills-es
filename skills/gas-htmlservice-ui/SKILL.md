---
name: gas-htmlservice-ui
description: >-
  Interfaces de usuario en Apps Script con HtmlService: plantillas, include de parciales, diálogos modales
  y barras laterales, comunicación cliente-servidor con google.script.run, límites de serialización y seguridad.
  Usar cuando: se construyan modales, sidebars o vistas HTML servidas con HtmlService y google.script.run en GAS.
  NO usar cuando: se desarrolle una SPA independiente (React/Vue/Next.js) fuera de Google Apps Script.
---

# Interfaces con HtmlService (`gas-htmlservice-ui`)

---

## 1. Superficies de UI

| Superficie | API | Uso |
| :--- | :--- | :--- |
| Diálogo modal | `SpreadsheetApp.getUi().showModalDialog(html, titulo)` | Captura bloqueante de datos. |
| Diálogo no modal | `showModelessDialog(html, titulo)` | Panel flotante que no bloquea la hoja. |
| Barra lateral | `showSidebar(html)` | Panel persistente (dashboards, formularios). |
| Web App | `doGet` + `HtmlService.createTemplateFromFile` | Portal independiente. |

---

## 2. Plantillas y Parciales (`include`)

```javascript
/**
 * Incluye un archivo HTML estático (CSS/JS/parcial) dentro de una plantilla.
 * Uso en la plantilla: <?!= include('Estilos'); ?>
 * @param {string} nombreArchivo
 * @returns {string}
 */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

function mostrarModalSolicitud() {
  const plantilla = HtmlService.createTemplateFromFile('ModalSolicitud');
  plantilla.fila = SpreadsheetApp.getActiveRange().getRow();
  const html = plantilla.evaluate().setWidth(520).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Registrar solicitud');
}
```

> [!IMPORTANT]
> `<?!= ... ?>` (sin escape) **solo** para `include()` de archivos propios. Todo dato dinámico va con `<?= ... ?>`.

---

## 3. Cliente → Servidor con `google.script.run`

```html
<script>
  function guardar() {
    const payload = { fila: <?= fila ?>, estado: document.getElementById('estado').value };
    document.getElementById('btn').disabled = true;
    google.script.run
      .withSuccessHandler(function (resp) {
        if (resp.success) { google.script.host.close(); }
        else { mostrarError(resp.error); document.getElementById('btn').disabled = false; }
      })
      .withFailureHandler(function (err) {
        mostrarError(err.message);
        document.getElementById('btn').disabled = false;
      })
      .guardarSolicitudDesdeModal(payload);
  }
  function mostrarError(msg) { document.getElementById('error').textContent = msg; }
</script>
```

Lado servidor:

```javascript
/**
 * Función invocable desde el cliente. Valida TODO: el cliente es no confiable.
 * @param {{fila: number, estado: string}} payload
 * @returns {ServiceResponse}
 */
function guardarSolicitudDesdeModal(payload) {
  const fila = Number(payload && payload.fila);
  if (!Number.isInteger(fila) || fila < 2) {
    return { success: false, data: null, error: 'Fila inválida.' };
  }
  return LockManager.ejecutarTransaccion(() => {
    // ... persistir con sanitización y mapa dinámico de columnas
    return { fila: fila };
  });
}
```

---

## 4. Reglas del Canal Cliente-Servidor

1. Los parámetros y retornos deben ser **serializables** (primitivos, arrays, objetos planos). Los objetos `Date` no se pueden transmitir: convertir a ISO string. Los objetos de servicios de Apps Script (`Range`, `Sheet`) no son transferibles.
2. Las funciones cuyo nombre **termina en guion bajo** (`privada_`) no son invocables desde el cliente: usar ese sufijo para toda lógica interna y exponer solo funciones de entrada pequeñas.
3. **Validar y autorizar en el servidor** cada llamada; ocultar un botón en el HTML no es control de acceso.
4. Siempre definir `withFailureHandler` y deshabilitar el botón mientras la llamada está en curso (evita doble envío).
5. Devolver el contrato `ServiceResponse` para manejar errores de negocio de forma uniforme.
6. `google.script.run` ejecuta con la identidad del usuario que abre la UI (en contenedor) o según `executeAs` (Web App).

---

## 5. Seguridad y Compatibilidad

* El modo de *sandbox* por defecto es IFRAME: el contenido corre aislado; no depender de `window.top`.
* Usar `setXFrameOptionsMode(ALLOWALL)` solo cuando la Web App deba embeberse en otro sitio; de lo contrario, mantener el valor por defecto (anti-*clickjacking*).
* Evitar `innerHTML` con datos dinámicos en el cliente: usar `textContent` o escapar.
* Limitar tamaño del HTML y cargar librerías externas solo desde CDN confiables con *Subresource Integrity* cuando sea posible.

