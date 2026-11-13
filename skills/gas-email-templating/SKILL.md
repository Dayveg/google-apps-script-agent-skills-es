---
name: gas-email-templating
description: >-
  Envío de correos desde Apps Script: plantillas HtmlService, MailApp vs GmailApp, escape de contenido,
  control de cuotas diarias, redirección segura en ambientes de desarrollo y reglas de entregabilidad.
---

# Plantillas y Envío de Correos (`gas-email-templating`)

---

## 1. `MailApp` vs `GmailApp`

| Criterio | `MailApp` | `GmailApp` |
| :--- | :--- | :--- |
| Función | Solo **enviar** correos. | Enviar y además leer/buscar/etiquetar el buzón. |
| Scope OAuth | `https://www.googleapis.com/auth/script.send_mail` (mínimo). | `https://mail.google.com/` (acceso amplio al buzón). |
| Recomendación | **Preferir** cuando solo se envía (menor privilegio). | Solo si se requiere leer o manipular mensajes. |

Cuota diaria oficial de destinatarios: **100/día** en cuentas de consumidor (`@gmail.com`) y **1.500/día** en cuentas de Google Workspace. Verificar siempre el saldo en tiempo real con `MailApp.getRemainingDailyQuota()`.

---

## 2. Plantilla HTML con Escape Automático

`PlantillaCorreo.html`:

```html
<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; color: #333;">
    <h2><?= titulo ?></h2>
    <p>Respetado(a) <?= destinatario ?>,</p>
    <p><?= mensaje ?></p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      <? for (var i = 0; i < filas.length; i++) { ?>
        <tr><td><?= filas[i].campo ?></td><td><?= filas[i].valor ?></td></tr>
      <? } ?>
    </table>
    <? if (urlAccion) { ?>
      <p><a href="<?= urlAccion ?>">Abrir solicitud</a></p>
    <? } ?>
  </body>
</html>
```

> [!IMPORTANT]
> Usar siempre `<?= ... ?>` (escapado) para datos de usuarios. `<?!= ... ?>` inserta HTML sin escapar y solo es válido para fragmentos estáticos propios. Los atributos `href` con URLs de usuario deben validarse (solo `https:`).

---

## 3. Renderizado y Envío

```javascript
/**
 * Renderiza la plantilla de correo con datos escapados.
 *
 * @param {{titulo: string, destinatario: string, mensaje: string, filas: Array<{campo: string, valor: string}>, urlAccion?: string}} datos
 * @returns {string} HTML listo para enviar.
 */
function renderizarCorreo(datos) {
  const plantilla = HtmlService.createTemplateFromFile('PlantillaCorreo');
  plantilla.titulo = datos.titulo;
  plantilla.destinatario = datos.destinatario;
  plantilla.mensaje = datos.mensaje;
  plantilla.filas = datos.filas || [];
  plantilla.urlAccion = /^https:\/\//.test(datos.urlAccion || '') ? datos.urlAccion : '';
  return plantilla.evaluate().getContent();
}

/**
 * Envía un correo HTML con versión de texto plano alternativa.
 *
 * @param {string} para - Destinatario (se resuelve por el filtro de entorno).
 * @param {string} asunto
 * @param {Object} datos - Datos para la plantilla.
 * @returns {ServiceResponse}
 */
function enviarCorreoPlantilla(para, asunto, datos) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) {
      return { success: false, data: null, error: 'Cuota diaria de correo agotada.' };
    }
    MailApp.sendEmail({
      to: resolverDestinatarioSeguro_(para),
      subject: asunto,
      body: datos.mensaje,            // alternativa en texto plano
      htmlBody: renderizarCorreo(datos),
      name: 'Notificaciones del Sistema'
    });
    return { success: true, data: { enviado: true }, error: null };
  } catch (error) {
    return { success: false, data: null, error: 'Error al enviar correo: ' + error.message };
  }
}
```

---

## 4. Redirección Segura en Desarrollo

En ambiente `DEVELOPMENT` **ningún correo debe llegar a terceros**: redirigir todo a un buzón de pruebas definido en `ScriptProperties`.

```javascript
/**
 * Devuelve el destinatario efectivo según el ambiente.
 * @private
 * @param {string|string[]} destinatario
 * @returns {string}
 */
function resolverDestinatarioSeguro_(destinatario) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ENVIRONMENT') !== 'PRODUCTION') {
    const buzonPruebas = props.getProperty('CORREO_PRUEBAS');
    if (!buzonPruebas) throw new Error('CORREO_PRUEBAS no configurado en ambiente no productivo.');
    return buzonPruebas;
  }
  return Array.isArray(destinatario) ? destinatario.join(',') : String(destinatario);
}
```

---

## 5. Buenas Prácticas de Entregabilidad

* Limitar listas de beneficiarios largas en el cuerpo (p. ej. máximo 3 nombres + "y otros").
* Incluir siempre `body` de texto plano junto a `htmlBody`.
* Evitar imágenes remotas; usar estilos *inline* (los clientes de correo ignoran `<style>` externo).
* Registrar envíos (destinatario enmascarado, plantilla, resultado) para auditoría.

