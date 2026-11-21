# Guía de Contribución (`CONTRIBUTING.md`)

Gracias por tu interés en contribuir a **Google Apps Script Enterprise Agent Skills (ES)**.

---

## 1. Estándares de Calidad para Skills

Toda propuesta de nueva skill o modificación debe cumplir con:

1. **Frontmatter YAML válido** en `skills/<nombre-skill>/SKILL.md`:
   - `name`: debe coincidir exactamente con el nombre del directorio.
   - `description`: debe incluir disparadores explícitos `Usar cuando:` y `NO usar cuando:`.
2. **Divulgación Progresiva (*Progressive Disclosure*)**:
   - Mantener `SKILL.md` conciso (<200 líneas) y delegar implementaciones extensas a `references/` o plantillas a `assets/`.
3. **Alineación con Google Apps Script V8**:
   - Prohibido el uso de `var`, operaciones I/O de Sheets dentro de bucles, índices estáticos de columnas o servicios retirados (`ContactsApp`, `Area120Tables`, `AnalyticsReporting`).
   - Retornar contratos estructurados `ServiceResponse` y documentar funciones con JSDoc.

---

## 2. Verificación Obligatoria Antes de Enviar un Pull Request

Ejecuta en la raíz del repositorio:

```bash
npm test
npm run validate
```

Ambos comandos deben finalizar con **0 errores**.

---

## 3. Licencia de Contribuciones (*Inbound = Outbound*)

Al enviar una contribución (Pull Request, Issue o parche) a este repositorio, aceptas que:

- Toda contribución de **documentación y especificaciones** (`SKILL.md`, `references/`, `README.md`) se licencia bajo **Creative Commons Atribución 4.0 Internacional ([CC BY 4.0](./LICENSE))**.
- Toda contribución de **código ejecutable, scripts, tests, plantillas y snippets** (`scripts/`, `tests/`, `assets/` y bloques de código) se licencia bajo **Apache License, Version 2.0 ([Apache-2.0](./LICENSE-APACHE))**, conforme a la Sección 5 de dicha licencia.
