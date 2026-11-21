# Política de Seguridad (`SECURITY.md`)

## Versiones Soportadas

| Versión | Soportada |
| :--- | :---: |
| `1.0.x` | Sí |

---

## Reporte de Vulnerabilidades

Si identificas un riesgo de seguridad en cualquiera de las skills, plantillas, scripts ejecutables (`scripts/gas-scan.mjs`, `scripts/validate-skills.mjs`) o patrones de código (por ejemplo, vectores de *Formula Injection*, *XSS* en `HtmlService`, exposición de credenciales o permisos excesivos en `appsscript.json`):

1. **No publiques el hallazgo en un Issue público** si expone una vulnerabilidad explotable.
2.Utiliza la función **[Report a vulnerability](https://github.com/Dayveg/google-apps-script-agent-skills-es/security/advisories/new)** (*Private Vulnerability Reporting* de GitHub Security Advisories) en el repositorio oficial.
3. Incluye una descripción técnica del vector, la skill o archivo afectado y una propuesta de mitigación.

---

## Garantías de Ejecución del Escáner (`gas-scan`)

- `scripts/gas-scan.mjs` y `scripts/validate-skills.mjs` operan **100% en local y de solo lectura** usando únicamente módulos nativos de Node.js (`node:fs`, `node:path`).
- No realizan peticiones de red, no instalan dependencias de terceros en tiempo de ejecución ni modifican archivos del proyecto auditado.
