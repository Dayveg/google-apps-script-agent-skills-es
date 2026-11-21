---
name: gas-workspace-addons
description: >-
  Desarrollo de Google Workspace Add-ons con CardService, configuración de manifiesto addOns en appsscript.json,
  triggers contextuales por host (Gmail, Sheets, Drive, Calendar, Docs, Chat) y publicación segura.
  Usar cuando: se construyan complementos de Google Workspace con CardService y sección addOns en appsscript.json.
  NO usar cuando: se construyan interfaces HTML/CSS libres con HtmlService (usar gas-htmlservice-ui) o Web Apps REST.
---

# Google Workspace Add-ons con `CardService` (`gas-workspace-addons`)

Estándares para construir complementos nativos de Google Workspace mediante **`CardService`** y el bloque `addOns` de `appsscript.json`, conforme a [Google Workspace Add-ons](https://developers.google.com/workspace/add-ons/guides/manifests).

---

## 1. Manifiesto Canónico (`appsscript.json`)

```json
{
  "timeZone": "America/Bogota",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.container.ui"
  ],
  "urlFetchWhitelist": [
    "https://api.mi-dominio.com/"
  ],
  "addOns": {
    "common": {
      "name": "Asistente Corporativo",
      "logoUrl": "https://cdn.mi-dominio.com/logo.png",
      "layoutProperties": {
        "primaryColor": "#035aa6"
      },
      "homepageTrigger": {
        "runFunction": "onHomepage"
      }
    },
    "sheets": {
      "homepageTrigger": {
        "runFunction": "onSheetsHomepage"
      }
    }
  }
}
```

- **`addOns.common`**: obligatorio (`name`, `logoUrl` HTTPS público, `homepageTrigger`).
- **Hosts soportados**: `gmail`, `calendar`, `drive`, `docs`, `sheets`, `slides`, `chat`.
- **`urlFetchWhitelist`**: obligatorio en Add-ons publicados que usen `UrlFetchApp`; solo prefijos `https://` con dominio y ruta.

---

## 2. Construcción de Tarjetas (`CardService`)

```javascript
/**
 * Trigger principal del Add-on al abrir el panel lateral.
 *
 * @param {Object} e - Evento de host de Google Workspace.
 * @returns {GoogleAppsScript.Card_Service.Card}
 */
function onHomepage(e) {
  const accion = CardService.newAction()
    .setFunctionName('ejecutarAccionAddon')
    .setParameters({ origen: String(e.hostApp || 'unknown') });

  const boton = CardService.newTextButton()
    .setText('Procesar')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(accion);

  const seccion = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Panel operativo listo.'))
    .addWidget(boton);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Asistente Corporativo'))
    .addSection(seccion)
    .build();
}
```

---

## 3. Reglas de Seguridad y Navegación

1. **Retornar `ActionResponse` explícito** en callbacks de botones (`CardService.newActionResponseBuilder().setNotification(...)` o `.setNavigation(...)`).
2. **Validar `e.commonEventObject.formInputs`** antes de procesar entradas del usuario; nunca confiar en parámetros sin sanitizar.
3. **Menú mínimo**: declarar únicamente los host apps y `oauthScopes` estrictamente necesarios para aprobar la revisión de Google Workspace Marketplace.
