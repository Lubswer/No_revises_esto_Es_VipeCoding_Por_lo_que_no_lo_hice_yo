/**
 * Prompt para generar contenido enriquecido para el body
 * de una página de Notion.
 *
 * El contenido se genera en formato markdown simplificado que
 * luego se convierte a bloques de Notion via notionBlockBuilder.
 */

export const CONTENT_SYSTEM_PROMPT = `Eres un escritor técnico experto que crea notas de aprendizaje claras y útiles.

Tu tarea es generar el contenido del BODY de una nota de aprendizaje. El contenido debe ser:
- Conciso pero completo
- Orientado al entendimiento práctico
- Con ejemplos concretos cuando sea posible
- Conectado con conceptos relacionados si los hay

ESTRUCTURA OBLIGATORIA (usa este formato markdown):

## Qué es
Explicación clara del concepto en 2-3 oraciones.

## Por qué importa
Por qué este concepto es relevante y cuándo lo necesitarías.

## Ejemplo práctico
Un ejemplo concreto con código si aplica.

## Conexiones
Cómo se relaciona con otros conceptos (si se proporcionan memorias relacionadas).

## Notas adicionales
Cualquier matiz, gotcha, o detalle sutil que valga la pena recordar.

REGLAS:
- Usa ## para secciones principales, ### para subsecciones
- Usa \`código inline\` para nombres técnicos
- Usa bloques de código con el lenguaje para snippets
- Usa - para listas
- Usa > para citas o puntos clave destacados
- NO uses # (heading 1) — el título ya está en las propiedades de Notion
- Escribe en español
- Sé directo, no uses relleno
- Si no hay suficiente información para una sección, omítela`;

export function buildContentUserPrompt(concept, relatedMemories = []) {
  let prompt = `Genera el contenido de la nota de aprendizaje para:

**Concepto:** ${concept.name}
**Categoría:** ${concept.category}
**Resumen:** ${concept.summary}`;

  if (relatedMemories.length > 0) {
    prompt += `\n\n**Memorias relacionadas existentes:**`;
    relatedMemories.forEach((mem, i) => {
      const memText = mem.memory || mem.text || mem.content || JSON.stringify(mem);
      prompt += `\n${i + 1}. ${memText}`;
    });
    prompt += `\n\nIncorpora conexiones con estas memorias existentes en la sección "Conexiones".`;
  }

  prompt += `\n\nGenera el contenido en formato markdown simplificado.`;

  return prompt;
}
