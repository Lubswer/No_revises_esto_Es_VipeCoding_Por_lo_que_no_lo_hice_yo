# Plan de Trabajo: Agente de Memoria de Aprendizaje Personal (Mem0 + Notion)

## Resumen del proyecto

Un sistema que captura conceptos importantes de tus conversaciones, los procesa con Mem0 (extracción, deduplicación, relación semántica), y los materializa como páginas legibles y navegables en Notion — combinando la inteligencia de curación de Mem0 con Notion como capa de presentación humana.

**Arquitectura en una frase:** LLM decide *qué* y *cómo se relaciona* → tu backend decide *cómo se escribe* → Notion es donde tú lo lees.

---

## Fase 0 — Diseño y setup (1 semana)

**Objetivo:** dejar listas las decisiones que condicionan todo lo demás, antes de escribir código.

- [ ] Diseñar el **esquema de la base de Notion**: propiedades (Concepto, Categoría, Fuente, Fecha, Resumen, Relacionados como `Relation`, Estado de madurez de la idea, etc.)
- [ ] Decidir el **modelo de captura**: ¿vas a pegar/enviar transcripciones manualmente al inicio, o desde ya automatizar la captura desde donde converses?
- [ ] Crear la integración de Notion (Settings → Connections), con permisos de **lectura + escritura** habilitados explícitamente.
- [ ] Compartir la base de datos destino con la integración.
- [ ] Crear cuenta de Mem0 (Hobby/free para prototipar) y obtener API key.
- [ ] Decidir stack: Node.js (recomendado, mejor soporte del SDK de Notion) o Python.

**Entregable:** esquema de Notion definido + credenciales funcionando (`NOTION_TOKEN`, `NOTION_DATABASE_ID`, `MEM0_API_KEY`).

---

## Fase 1 — Pipeline de captura y extracción (1-2 semanas)

**Objetivo:** que el texto de una conversación se convierta en "candidatos a memoria" limpios.

- [ ] Función que recibe un fragmento de conversación (texto crudo).
- [ ] Llamada a `mem0.add()` para que Mem0 extraiga los hechos/conceptos relevantes (extracción + deduplicación + ADD/UPDATE/DELETE/NOOP ya viene resuelto por Mem0).
- [ ] Ajustar el criterio de "importancia" para tu caso de uso: Mem0 por defecto está afinado para preferencias de usuario, no para conceptos de aprendizaje — probablemente necesites un prompt de extracción propio (system prompt custom o post-procesamiento) que distinga "concepto/idea/descubrimiento" de "preferencia personal".
- [ ] Prueba con conversaciones reales tuyas: revisar manualmente qué está guardando Mem0 y calibrar falsos positivos/negativos.

**Entregable:** script que toma texto → devuelve lista de memorias estructuradas (concepto, categoría tentativa, resumen).

---

## Fase 2 — Relación semántica con conocimiento previo (1 semana)

**Objetivo:** resolver la pieza de "conectar con lo que ya sabes".

- [ ] Usar `mem0.search()` para encontrar memorias existentes semánticamente similares antes de escribir una nueva.
- [ ] Definir lógica de decisión: ¿nueva nota independiente, actualización de una existente, o nota nueva enlazada a una existente vía relación?
- [ ] Si usas la capa de grafo de Mem0 (Pro, $249/mes) para relaciones entidad-entidad más ricas, evaluar aquí si el costo se justifica vs. hacerlo tú con búsqueda vectorial simple (Hobby/Starter).

**Entregable:** función que, dado un concepto nuevo, devuelve si es nuevo, actualización, o relacionado con notas existentes (y con cuáles).

---

## Fase 3 — Escritura determinística en Notion (1-2 semanas)

**Objetivo:** materializar las decisiones de las fases 1-2 como páginas reales en Notion, con código, no con prompts al agente.

- [ ] Función `crearPagina()` usando `notion.pages.create()`, mapeando el JSON estructurado del LLM a los tipos de propiedad exactos de tu esquema (title, select, relation, rich_text...).
- [ ] Función `actualizarPagina()` usando `notion.pages.update()` para los casos de UPDATE.
- [ ] Función para escribir contenido en el **cuerpo** de la página (no solo propiedades) vía `notion.blocks.children.append()` — aquí va la explicación/desarrollo del concepto.
- [ ] Manejo de relaciones: buscar `page_id` de notas relacionadas antes de poder enlazarlas vía propiedad `Relation`.
- [ ] Throttling básico para respetar el rate limit de Notion (~3 req/seg).
- [ ] Manejo de errores: qué pasa si Notion rechaza la escritura (reintentos, log, no perder la memoria ya extraída).

**Entregable:** pipeline completo funcionando de punta a punta: texto → Mem0 → decisión de relación → página en Notion.

---

## Fase 4 — Automatización / disparadores (1-2 semanas)

**Objetivo:** que esto deje de requerir que tú lo actives manualmente cada vez.

- [ ] Decidir el punto de captura: ¿un endpoint al que le mandas texto manualmente al principio? ¿integración con el cliente donde conversas normalmente?
- [ ] Si quieres que corra en background sin intervención tuya, esto requiere un servicio corriendo (no un chat que abres) — evaluar opciones simples: un webhook, una tarea programada, o un pequeño servidor que expongas tú mismo.
- [ ] Logging de qué se guardó y cuándo, para poder auditar/revertir si algo se clasificó mal.

**Entregable:** el sistema corre sin que tengas que ejecutar el script a mano cada vez.

---

## Fase 5 — Refinamiento y curación (continuo)

**Objetivo:** ajustar la calidad con el tiempo, no una sola vez.

- [ ] Revisión periódica manual: ¿la base de Notion se está volviendo útil o ruidosa?
- [ ] Ajustar el prompt de extracción según patrones de error que veas.
- [ ] Definir política de "olvido": ¿algo deja de ser relevante y se archiva?
- [ ] Considerar exportar/respaldar periódicamente (con el script de lectura que ya viste) por si necesitas migrar o auditar todo el dataset.

---

## Stack técnico propuesto

| Componente | Herramienta |
|---|---|
| Extracción y memoria semántica | Mem0 (SDK, plan Hobby/Starter para empezar) |
| Backend/orquestación | Node.js + `@notionhq/client` |
| Base de conocimiento visible | Notion (base de datos con `Relation`) |
| LLM para juicio de importancia (si personalizas más allá de Mem0) | API de Claude u otro, vía llamada de función — nunca vía chat manual |

## Riesgos a vigilar

- **Costo de Mem0** si el volumen de memorias crece rápido y necesitas la capa de grafo (salto de $19 a $249/mes).
- **Calidad de extracción**: el criterio de "importante" para aprendizaje es distinto al de "preferencias de usuario" que Mem0 optimiza por defecto — vas a necesitar iterar el prompt.
- **Mapeo de tipos de propiedad de Notion**: es el punto más propenso a errores silenciosos si el esquema cambia y el código no se actualiza.
- **Automatización real**: si el objetivo final es "que pase solo mientras converso en cualquier lado", la Fase 4 es la más abierta — vale la pena decidir pronto qué tan automático lo quieres realmente, porque condiciona el resto del diseño.

## Próximo paso inmediato

Definir el esquema exacto de la base de Notion (Fase 0) — todo lo demás depende de esa decisión.
