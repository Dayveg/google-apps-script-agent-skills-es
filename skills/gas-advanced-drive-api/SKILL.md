---
name: gas-advanced-drive-api
description: >-
  Patrones canónicos de alto rendimiento con Google Drive API v3 (Servicio Avanzado):
  soporte total de Unidades Compartidas (Shared Drives), consultas indexadas q, proyección fields, carga multipart y gestión de permisos.
---

# Google Drive API v3 — Servicio Avanzado (`gas-advanced-drive-api`)

Esta especificación establece las directrices de ingeniería para la gestión documental empresarial mediante el **Servicio Avanzado de Drive (Drive API v3)**, superando los fallos de visibilidad en Unidades Compartidas (*Shared Drives*) y la latencia acumulada de `DriveApp`.

---

## 1. Justificación Técnica: `DriveApp` vs `Drive API v3`

| Criterio Técnico | `DriveApp` (Nativo) | `Drive API v3` (Servicio Avanzado) |
| :--- | :--- | :--- |
| **Soporte de Unidades Compartidas** | Incompleto. Falla o ignora archivos en Shared Drives sin advertencias claras. | **Soporte Nativo 100%** mediante `supportsAllDrives: true` e `includeItemsFromAllDrives: true`. |
| **Carga de Red (Payload)** | Descarga el árbol de metadatos completo de cada archivo (muy pesado). | Permite proyección de campos (`fields`), descargando **exclusivamente** los bytes requeridos (`id, name, mimeType`). |
| **Búsquedas de Archivos** | `getFilesByName()` es secuencial e ineficiente frente a miles de expedientes. | Motor de indexación `q` optimizado con operadores booleanos (`and`, `or`, `contains`). |
| **Permisos Corporativos** | Capacidades limitadas a listas simples. | Gestión granular de roles (`organizer`, `fileOrganizer`, `writer`, `reader`). |

---

## 2. Activación en `appsscript.json`

```json
{
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "serviceId": "drive",
        "version": "v3"
      }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file"
  ]
}
```

---

## 3. Motor de Búsqueda Indexada con Proyección `fields`

En Google Drive API v3, omitir el parámetro `fields` es un antipatrón severo. Se debe proyectar únicamente la información necesaria para optimizar la velocidad y la memoria:

```javascript
/**
 * Realiza una búsqueda paginada y optimizada en Google Drive con soporte para Unidades Compartidas.
 *
 * @param {string} consultaQ - Filtro de búsqueda en sintaxis oficial de Drive v3.
 * @param {string} [idCarpetaPadre=null] - ID de la carpeta contenedora para acotar la búsqueda.
 * @param {number} [maxResultados=200] - Límite de resultados a recuperar.
 * @returns {ServiceResponse} Array de metadatos de archivos encontrados.
 */
function buscarExpedientesAvanzado(consultaQ, idCarpetaPadre = null, maxResultados = 200) {
  try {
    let clausula = 'trashed = false';

    if (idCarpetaPadre) {
      clausula += ` and ('${idCarpetaPadre}' in parents)`;
    }

    if (consultaQ && consultaQ.trim() !== '') {
      clausula += ` and (${consultaQ.trim()})`;
    }

    const opciones = {
      q: clausula,
      // Proyección estricta: descarga solo los atributos requeridos
      fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, webViewLink)',
      pageSize: Math.min(maxResultados, 100),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives'
    };

    const expedientes = [];
    let tokenPagina = null;

    do {
      if (tokenPagina) {
        opciones.pageToken = tokenPagina;
      }

      const respuesta = Drive.Files.list(opciones);

      if (respuesta.files && respuesta.files.length > 0) {
        for (let i = 0; i < respuesta.files.length; i++) {
          const f = respuesta.files[i];
          expedientes.push({
            id: f.id,
            nombre: f.name,
            mimeType: f.mimeType,
            fechaCreacion: f.createdTime,
            fechaModificacion: f.modifiedTime,
            tamanioBytes: parseInt(f.size || '0', 10),
            url: f.webViewLink
          });

          if (expedientes.length >= maxResultados) {
            break;
          }
        }
      }

      tokenPagina = respuesta.nextPageToken;
    } while (tokenPagina && expedientes.length < maxResultados);

    return Response.ok(expedientes);
  } catch (error) {
    return Response.fail('Error en Drive API list: ' + error.message, 'DRIVE_LIST_ERROR');
  }
}
```

---

## 4. Creación Segura de Subcarpetas en Unidades Compartidas

```javascript
/**
 * Crea una carpeta o expediente garantizando herencia de permisos en Unidades Compartidas.
 *
 * @param {string} nombreCarpeta - Nombre del nuevo directorio.
 * @param {string} idCarpetaPadre - ID de la carpeta contenedora.
 * @returns {ServiceResponse} Datos del expediente creado.
 */
function crearCarpetaExpedienteAvanzado(nombreCarpeta, idCarpetaPadre) {
  if (!nombreCarpeta || !idCarpetaPadre) {
    return Response.fail('Nombre de carpeta e ID de carpeta padre son obligatorios.');
  }

  try {
    const metadata = {
      name: nombreCarpeta.trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [idCarpetaPadre]
    };

    const nuevaCarpeta = Drive.Files.create(metadata, {
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, createdTime'
    });

    return Response.ok({
      id: nuevaCarpeta.id,
      nombre: nuevaCarpeta.name,
      url: nuevaCarpeta.webViewLink,
      fechaCreacion: nuevaCarpeta.createdTime
    });
  } catch (error) {
    return Response.fail('Fallo al crear carpeta en Drive v3: ' + error.message, 'DRIVE_CREATE_ERROR');
  }
}
```

---

## 5. Carga de Archivos Binarios / PDF (Carga Multipart)

Para persistir contratos, anexos o soportes PDF generados o recibidos vía OCR:

```javascript
/**
 * Sube un archivo binario (ej. PDF o documento) a una carpeta de Google Drive.
 *
 * @param {GoogleAppsScript.Base.Blob} blobArchivo - Contenido binario del archivo.
 * @param {string} idCarpetaPadre - ID de la carpeta de destino.
 * @param {string} [nombrePersonalizado=null] - Nombre alternativo opcional.
 * @returns {ServiceResponse}
 */
function subirArchivoBinarioAvanzado(blobArchivo, idCarpetaPadre, nombrePersonalizado = null) {
  if (!blobArchivo || !idCarpetaPadre) {
    return Response.fail('El blob del archivo y la carpeta destino son obligatorios.');
  }

  try {
    const metadata = {
      name: nombrePersonalizado || blobArchivo.getName(),
      mimeType: blobArchivo.getContentType(),
      parents: [idCarpetaPadre]
    };

    const archivoSubido = Drive.Files.create(metadata, blobArchivo, {
      supportsAllDrives: true,
      fields: 'id, name, size, webViewLink'
    });

    return Response.ok({
      id: archivoSubido.id,
      nombre: archivoSubido.name,
      tamanioBytes: parseInt(archivoSubido.size || '0', 10),
      url: archivoSubido.webViewLink
    });
  } catch (error) {
    return Response.fail('Fallo en carga binaria Drive v3: ' + error.message, 'DRIVE_UPLOAD_ERROR');
  }
}
```

---

## 6. Asignación Granular de Permisos con `Drive.Permissions.create`

```javascript
/**
 * Concede permisos de acceso a un usuario sobre un archivo o expediente corporativo.
 *
 * @param {string} idArchivo - ID del archivo o carpeta.
 * @param {string} correoElectronico - Correo del usuario a autorizar.
 * @param {'reader'|'commenter'|'writer'|'fileOrganizer'} rol - Nivel de acceso.
 * @param {boolean} [notificarPorCorreo=false] - Si se envía notificación por email.
 * @returns {ServiceResponse}
 */
function asignarPermisoExpediente(idArchivo, correoElectronico, rol = 'reader', notificarPorCorreo = false) {
  try {
    const permiso = {
      role: rol,
      type: 'user',
      emailAddress: correoElectronico
    };

    const resultado = Drive.Permissions.create(permiso, idArchivo, {
      supportsAllDrives: true,
      sendNotificationEmail: notificarPorCorreo,
      fields: 'id, role, emailAddress'
    });

    return Response.ok(resultado);
  } catch (error) {
    return Response.fail('Error al asignar permisos en Drive v3: ' + error.message, 'DRIVE_PERMISSIONS_ERROR');
  }
}
```