---
name: gas-docs-slides-pdf-generation
description: >-
  Generación automatizada de documentos y presentaciones con DocumentApp y SlidesApp: copia de plantillas,
  reemplazo seguro de marcadores ({{CAMPO}}), soporte de Document Tabs (getTabs()), saveAndClose() y exportación a PDF.
  Usar cuando: se generen contratos, actas, certificados o reportes PDF desde plantillas de Google Docs o Slides en GAS.
  NO usar cuando: se procesen PDFs entrantes por OCR (usar gas-document-ocr-processing) o se generen PDFs fuera de GAS.
---

# Generación de Documentos, Pestañas y PDFs (`gas-docs-slides-pdf-generation`)

Estándares oficiales para automatizar la generación de documentos y certificados corporativos usando **`DocumentApp`**, **`SlidesApp`** y **Drive API v3**, incluyendo la jerarquía de **pestañas (*Document Tabs*)** de Google Docs.

---

## 1. Reglas Críticas

1. **Nunca mutar la plantilla maestra**: clonar siempre el archivo base en la carpeta destino antes de reemplazar marcadores (`{{CAMPO}}`).
2. **`doc.saveAndClose()` obligatorio antes de exportar a PDF**: si se invoca `getAs('application/pdf')` sin haber cerrado el documento (`saveAndClose()`), el PDF resultante no incluirá los reemplazos realizados en memoria.
3. **Escapar metacaracteres Regex en `replaceText`**: `body.replaceText(patron, valor)` interpreta el primer argumento como expresión regular; escapar llaves `\\{\\{CAMPO\\}\\}`.
4. **Soporte de Pestañas (*Document Tabs*)**: en documentos con múltiples pestañas, preferir `doc.getTabs()` y `tab.asDocumentTab().getBody()` sobre `doc.getBody()` (que solo opera sobre la primera pestaña).

---

## 2. Implementación Canónica (Plantilla Docs → PDF)

```javascript
/**
 * Genera un PDF a partir de una plantilla de Google Docs reemplazando marcadores {{CLAVE}} en todas sus pestañas.
 *
 * @param {string} idPlantilla - ID del Google Doc maestro.
 * @param {string} idCarpetaDestino - ID de la carpeta en Drive (soporta Shared Drives).
 * @param {string} nombreArchivoSalida - Nombre final del documento/PDF.
 * @param {Object.<string, string>} campos - Diccionario { 'NOMBRE': 'Juan Pérez', 'CONSECUTIVO': 'RAD-001' }.
 * @param {boolean} [eliminarDocEditable=true] - Si es true, conserva solo el PDF final.
 * @returns {ServiceResponse}
 */
function generarPdfDesdePlantillaDoc(idPlantilla, idCarpetaDestino, nombreArchivoSalida, campos, eliminarDocEditable = true) {
  let idCopia = null;
  try {
    const copia = Drive.Files.copy(
      { name: nombreArchivoSalida, parents: [idCarpetaDestino] },
      idPlantilla,
      { supportsAllDrives: true, fields: 'id' }
    );
    idCopia = copia.id;

    const doc = DocumentApp.openById(idCopia);
    const cuerpos = typeof doc.getTabs === 'function' && doc.getTabs().length > 0
      ? doc.getTabs().map((t) => t.asDocumentTab().getBody())
      : [doc.getBody()];

    Object.keys(campos || {}).forEach((clave) => {
      const claveSegura = clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const valor = String(campos[clave] !== undefined && campos[clave] !== null ? campos[clave] : '');
      cuerpos.forEach((body) => {
        body.replaceText(`\\{\\{${claveSegura}\\}\\}`, valor);
      });
    });

    // Crítico: volcar cambios antes de exportar a PDF
    doc.saveAndClose();

    const blobPdf = DriveApp.getFileById(idCopia).getAs(MimeType.PDF).setName(`${nombreArchivoSalida}.pdf`);
    const pdfCreado = Drive.Files.create(
      { name: `${nombreArchivoSalida}.pdf`, mimeType: MimeType.PDF, parents: [idCarpetaDestino] },
      blobPdf,
      { supportsAllDrives: true, fields: 'id, name, webViewLink' }
    );

    if (eliminarDocEditable) {
      Drive.Files.remove(idCopia, { supportsAllDrives: true });
      idCopia = null;
    }

    return Response.ok({
      pdfId: pdfCreado.id,
      nombre: pdfCreado.name,
      url: pdfCreado.webViewLink,
      docEditableId: idCopia
    });
  } catch (error) {
    return Response.fail('Error al generar PDF desde plantilla: ' + error.message, 'DOC_PDF_GENERATION_ERROR');
  }
}
```
