---
name: gas-sheets-custom-functions
description: >-
  Funciones personalizadas en celdas de Google Sheets (@customfunction): autocompletado JSDoc, restricciones de
  AuthMode.CUSTOM_FUNCTION, procesamiento vectorial de rangos 2D y optimización contra el límite de 30 segundos.
  Usar cuando: se escriban fórmulas personalizadas invocables desde celdas (=MI_FUNCION(A1:A10)) en Google Sheets.
  NO usar cuando: se necesiten mutaciones de formato, envío de correos o lectura/escritura fuera de la celda (usar triggers o menús).
---

# Funciones Personalizadas en Google Sheets (`gas-sheets-custom-functions`)

Estándares oficiales para crear fórmulas personalizadas en Google Sheets mediante la etiqueta JSDoc **`@customfunction`**.

---

## 1. Reglas Críticas y Límites

- **Autorización restringida (`AuthMode.CUSTOM_FUNCTION`)**: **NO** pueden llamar servicios que requieran autorización del usuario (`GmailApp`, `MailApp`, `DriveApp`, `SpreadsheetApp.openById()`, `UrlFetchApp` con datos privados).
- **Solo retornan valor(es)**: una función personalizada no puede modificar otras celdas, colores ni menús; solo devuelve un escalar o una matriz 2D `Array<Array<*>>` que se expande desde la celda origen.
- **Límite de ejecución**: **30 segundos** por recálculo de fórmula.
- **Convenciones de nombre**:
  - No colisionar con funciones nativas (`SUM`, `IF`, `VLOOKUP`).
  - **No terminar en guion bajo (`_`)**, ya que GAS las trata como privadas y las oculta en Sheets.
  - Declarar con `function NOMBRE_FUNCION(...)` en el ámbito global.

---

## 2. Implementación Canónica (Escalar + Rango 2D)

```javascript
/**
 * Normaliza texto eliminando tildes y espacios redundantes.
 * Soporta tanto una celda individual como un rango 2D completo.
 *
 * @param {string|Array<Array<*>>} entrada - Celda o rango a normalizar.
 * @return {string|Array<Array<string>>} Texto normalizado en mayúsculas.
 * @customfunction
 */
function NORMALIZAR_TEXTO(entrada) {
  if (Array.isArray(entrada)) {
    return entrada.map((fila) => fila.map((celda) => NORMALIZAR_TEXTO(celda)));
  }

  if (entrada === null || entrada === undefined || entrada === '') {
    return '';
  }

  return String(entrada)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
```

---

## 3. Checklist de Verificación

1. Incluye `@customfunction` en el bloque JSDoc para habilitar autocompletado en Sheets.
2. Maneja recursivamente arreglos 2D (`Array.isArray(entrada)`) evitando que los usuarios tengan que arrastrar la fórmula fila por fila.
3. No invoca servicios bloqueados por `AuthMode.CUSTOM_FUNCTION` ni termina en `_`.
