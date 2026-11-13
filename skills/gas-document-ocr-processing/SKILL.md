---
name: gas-document-ocr-processing
description: >-
  Procesamiento OCR de PDF e imágenes en Google Apps Script con Drive API v3, extracción de campos con
  expresiones regulares validadas, limpieza de archivos temporales y control de calidad de datos extraídos.
---

# OCR y Extracción de Datos de Documentos (`gas-document-ocr-processing`)

Patrón para convertir PDFs/imágenes escaneadas en texto mediante la conversión OCR de **Google Drive**, extraer campos estructurados y validarlos antes de persistirlos.

---

## 1. Flujo

```
PDF/Imagen (Blob) → Drive.Files.create (convertir a Google Doc, ocrLanguage)
   → DocumentApp.openById().getBody().getText() → extracción (regex) → validación → persistencia
   → eliminar documento temporal (siempre, en finally)
```

> [!NOTE]
> El OCR de Drive aplica a **PDF e imágenes** y rinde mejor con escaneos nítidos. Para volúmenes o calidades exigentes, evaluar Document AI en Google Cloud. El texto resultante puede contener errores de reconocimiento: **nunca persistir sin validar**.

---

## 2. Conversión OCR con Drive API v3

Requiere el servicio avanzado `Drive` v3 y los scopes `drive.file` (y `documents` si se usa `DocumentApp`).

```javascript
/**
 * Extrae texto de un PDF/imagen vía conversión OCR de Drive y elimina el temporal.
 *
 * @param {GoogleAppsScript.Base.Blob} blob - Archivo PDF o imagen.
 * @param {string} [idioma='es'] - Pista de idioma OCR (código ISO 639-1).
 * @returns {ServiceResponse} data: texto extraído.
 */
function extraerTextoOcr(blob, idioma = 'es') {
  let idTemporal = null;
  try {
    const temporal = Drive.Files.create(
      {
        name: 'OCR_TEMP_' + Utilities.getUuid(),
        mimeType: 'application/vnd.google-apps.document' // fuerza conversión con OCR
      },
      blob,
      { ocrLanguage: idioma, supportsAllDrives: true, fields: 'id' }
    );
    idTemporal = temporal.id;

    const texto = DocumentApp.openById(idTemporal).getBody().getText();
    return { success: true, data: texto, error: null };
  } catch (error) {
    return { success: false, data: null, error: 'Fallo OCR: ' + error.message };
  } finally {
    if (idTemporal) {
      try {
        Drive.Files.remove(idTemporal, { supportsAllDrives: true });
      } catch (errLimpieza) {
        console.warn('No se pudo eliminar el temporal OCR ' + idTemporal + ': ' + errLimpieza.message);
      }
    }
  }
}
```

---

## 3. Extracción de Campos con Validación

Definir cada campo como **patrón + validador + normalizador**; descartar y marcar para revisión humana lo que no valide.

```javascript
/**
 * @typedef {Object} DefinicionCampo
 * @property {RegExp} patron - Expresión con un grupo de captura.
 * @property {function(string): boolean} validar - Validador del valor capturado.
 * @property {function(string): string} normalizar - Normalizador del valor.
 */

/** @type {Object.<string, DefinicionCampo>} */
const CAMPOS_DOCUMENTO = {
  numeroDocumento: {
    patron: /N[uú]mero[:\s]+([A-Z0-9\-]{5,20})/i,
    validar: (v) => v.length >= 5,
    normalizar: (v) => v.trim().toUpperCase()
  },
  valorTotal: {
    patron: /Valor\s+total[:\s$]+([\d.,]+)/i,
    validar: (v) => /\d/.test(v),
    normalizar: (v) => v.replace(/[^\d]/g, '')
  }
};

/**
 * Extrae y valida campos de un texto OCR.
 * @param {string} texto
 * @returns {{campos: Object.<string, string>, requierenRevision: string[]}}
 */
function extraerCampos(texto) {
  const campos = {};
  const requierenRevision = [];
  Object.keys(CAMPOS_DOCUMENTO).forEach((nombre) => {
    const def = CAMPOS_DOCUMENTO[nombre];
    const coincidencia = texto.match(def.patron);
    if (coincidencia && def.validar(coincidencia[1])) {
      campos[nombre] = def.normalizar(coincidencia[1]);
    } else {
      campos[nombre] = '';
      requierenRevision.push(nombre);
    }
  });
  return { campos: campos, requierenRevision: requierenRevision };
}
```

---

## 4. Buenas Prácticas

1. **Sanitizar** (`sanitizarEntradaTexto`) todo texto extraído antes de escribirlo en Sheets: el contenido del documento es entrada no confiable (*Formula Injection*).
2. Cuando el OCR sea ambiguo, **no adivinar**: dejar vacío y marcar `requierenRevision`.
3. Normalizar identificadores (documentos, NIT, números) con validación de dígito verificador cuando el estándar lo defina.
4. Procesar un archivo por iteración con control de tiempo (`gas-concurrency-chunking`); el OCR es lento (segundos por archivo).
5. Guardar el PDF original en Drive con nombre determinista y enlazarlo en la hoja para trazabilidad.
6. Si el texto puede contener datos personales, aplicar la política de tratamiento de datos de la organización antes de enviarlo a cualquier servicio externo (p. ej. un modelo de IA).

