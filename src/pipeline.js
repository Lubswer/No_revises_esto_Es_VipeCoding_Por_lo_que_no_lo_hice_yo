import logger from './utils/logger.js';
import * as groqService from './services/groqService.js';
import * as mem0Service from './services/mem0Service.js';
import * as notionService from './services/notionService.js';

/**
 * Verifica si un texto incluye el centinela '!' al inicio.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasSentinel(text) {
  if (!text || typeof text !== 'string') return false;
  return text.trim().startsWith('!');
}

/**
 * Verifica si un texto incluye el centinela de consulta '!?' al inicio.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasQuerySentinel(text) {
  if (!text || typeof text !== 'string') return false;
  return text.trim().startsWith('!?');
}

/**
 * Consulta la base de conocimiento en Notion + Mem0 y usa Groq
 * para redactar una respuesta basada EXCLUSIVAMENTE en las notas del usuario.
 *
 * @param {string} question - Pregunta del usuario (ej: "!? ¿Qué sé sobre closures?")
 * @returns {Promise<Object>} Respuesta redactada por Groq basada en Notion.
 */
export async function queryBrain(question) {
  // Limpiar el centinela '!?' del inicio
  const cleanQuestion = question.trim().startsWith('!?') 
    ? question.trim().slice(2).trim() 
    : question.trim();

  logger.info(`🧠 QueryBrain: Consultando base de datos para "${cleanQuestion}"...`);

  // 1. Buscar en Notion por texto
  let notionPages = [];
  try {
    notionPages = await notionService.searchConcepts(cleanQuestion, 5);
  } catch (err) {
    logger.warn(`QueryBrain: Error buscando en Notion: ${err.message}`);
  }

  // 2. Buscar en Mem0 por significado semántico
  let mem0Results = [];
  try {
    mem0Results = await mem0Service.searchRelated(cleanQuestion, 5);
  } catch (err) {
    logger.warn(`QueryBrain: Error buscando en Mem0: ${err.message}`);
  }

  // 3. Si encontramos páginas en Notion, leer el contenido completo de la más relevante
  let fullPageContent = null;
  if (notionPages.length > 0) {
    try {
      fullPageContent = await notionService.getPageContent(notionPages[0].id);
    } catch (err) {
      logger.warn(`QueryBrain: Error leyendo detalle de página: ${err.message}`);
    }
  }

  // 4. Si no se encontró NADA en Notion ni en Mem0
  if (notionPages.length === 0 && mem0Results.length === 0) {
    return {
      found: false,
      answer: `🔍 No encontré notas ni registros en tu Notion sobre "${cleanQuestion}".`,
      sourcePages: [],
    };
  }

  // 5. Construir contexto para Groq
  let contextPrompt = `A continuación tienes la información extraída de la BASE DE CONOCIMIENTO PERSONAL EN NOTION del usuario:\n\n`;

  if (fullPageContent) {
    contextPrompt += `=== NOTA PRINCIPAL EN NOTION ===\n`;
    contextPrompt += `Título: ${fullPageContent.name}\n`;
    contextPrompt += `Categoría: ${fullPageContent.category}\n`;
    contextPrompt += `Resumen: ${fullPageContent.summary}\n`;
    contextPrompt += `Tags: ${fullPageContent.tags.join(', ')}\n`;
    contextPrompt += `Fecha: ${fullPageContent.date} | Estado: ${fullPageContent.status}\n\n`;
    contextPrompt += `CONTENIDO DEL BODY:\n${fullPageContent.bodyContent}\n================================\n\n`;
  }

  if (notionPages.length > 1) {
    contextPrompt += `=== OTRAS NOTAS RELACIONADAS ===\n`;
    notionPages.slice(1).forEach((p, i) => {
      contextPrompt += `${i + 1}. ${p.name} [${p.category}] — ${p.summary}\n`;
    });
    contextPrompt += `================================\n\n`;
  }

  if (mem0Results.length > 0) {
    contextPrompt += `=== MEMORIAS SEMÁNTICAS (Mem0) ===\n`;
    mem0Results.forEach((m, i) => {
      const text = m.memory || m.text || m.content || '';
      contextPrompt += `${i + 1}. ${text}\n`;
    });
    contextPrompt += `==================================\n\n`;
  }

  contextPrompt += `PREGUNTA DEL USUARIO: "${cleanQuestion}"\n\n`;
  contextPrompt += `INSTRUCCIÓN: Responde a la pregunta del usuario basándote ÚNICAMENTE en la información proporcionada arriba. Sé directo, claro y cita el nombre de la página de Notion de donde proviene la respuesta. Si la pregunta no se responde con esta información, indícalo educadamente.`;

  // 6. Pedir a Groq que redacte la respuesta basada en tu Notion
  let answer = '';
  try {
    answer = await groqService.generatePageContent(
      { name: cleanQuestion, category: 'Respuesta', summary: 'Respuesta basada en Notion' },
      [{ memory: contextPrompt }]
    );
  } catch (err) {
    // Respuesta de respaldo si falla Groq
    answer = `📖 **Información encontrada en Notion:**\n\n${fullPageContent ? fullPageContent.bodyContent : notionPages.map(p => `- **${p.name}**: ${p.summary}`).join('\n')}`;
  }

  // Registrar en el log de consultas (queries.log)
  logger.query(cleanQuestion, notionPages.length, notionPages);

  return {
    found: true,
    answer,
    sourcePages: notionPages.map(p => ({ id: p.id, name: p.name, category: p.category })),
  };
}

/**
 * Genera una VISTA PREVIA de lo que se guardaría en Notion sin escribir nada aún.
 * Permite al usuario revisar y confirmar antes de modificar la base de datos.
 *
 * @param {string} text - Texto de la conversación.
 * @param {Object} options
 * @returns {Promise<Object>} Objeto de vista previa con conceptos y contenido.
 */
export async function generatePreview(text, { source = 'Chat' } = {}) {
  // Limpiar el centinela '!' si existe al inicio
  const cleanText = text.trim().startsWith('!') ? text.trim().slice(1).trim() : text.trim();

  logger.info(`🔍 Generando VISTA PREVIA para ${cleanText.length} caracteres...`);

  const extraction = await groqService.evaluateImportance(cleanText);

  if (!extraction.isImportant || extraction.concepts.length === 0) {
    return {
      hasConcepts: false,
      message: 'No se identificaron conceptos de aprendizaje relevantes para guardar.',
      previews: [],
    };
  }

  const previews = [];

  for (const concept of extraction.concepts) {
    // 1. Buscar memorias afines
    let relatedMemories = [];
    try {
      relatedMemories = await mem0Service.searchRelated(concept.summary || concept.name);
    } catch {
      // Ignorar error en preview
    }

    // 2. Verificar si la página ya existe en Notion
    const existingPage = await notionService.findPageByConceptName(concept.name);

    // 3. Generar propuesta de contenido
    let bodyContent = '';
    try {
      bodyContent = await groqService.generatePageContent(concept, relatedMemories);
    } catch {
      bodyContent = `## Resumen\n${concept.summary}`;
    }

    previews.push({
      action: existingPage ? 'UPDATE' : 'CREATE',
      existingPageId: existingPage?.id || null,
      concept: {
        name: concept.name,
        category: concept.category,
        summary: concept.summary,
        source,
        tags: concept.tags || [],
        bodyContent,
      },
      relatedMemoriesCount: relatedMemories.length,
    });
  }

  return {
    hasConcepts: true,
    message: `Se identificaron ${previews.length} concepto(s) para guardar/actualizar.`,
    previews,
  };
}

/**
 * Pipeline principal: texto de conversación → conceptos en Notion.
 *
 * Flujo:
 * 1. Verifica centinela '!' si se especifica requireSentinel: true
 * 2. Groq evalúa importancia y extrae conceptos candidatos
 * 3. Para cada concepto relevante:
 *    a. Mem0 busca memorias relacionadas existentes
 *    b. Mem0 almacena el concepto (maneja dedup internamente)
 *    c. Decide: ¿página nueva, actualización, o enlace?
 *    d. Groq genera contenido enriquecido para el body
 *    e. Notion crea/actualiza la página
 * 4. Retorna resumen de lo procesado
 *
 * @param {string} text - Texto crudo de conversación.
 * @param {Object} options
 * @param {string} options.source - Fuente del texto (default: 'Conversación').
 * @param {boolean} options.requireSentinel - Si es true, exige '!' al inicio del texto.
 * @returns {Promise<Object>} Resumen del procesamiento.
 */
export async function processConversation(text, { source = 'Conversación', requireSentinel = false } = {}) {
  // Validar centinela si es requerido
  if (requireSentinel && !hasSentinel(text)) {
    logger.skipped('El texto no empieza con el centinela "!" — Guardado omitido');
    return {
      inputLength: text.length,
      conceptsFound: 0,
      pagesCreated: 0,
      pagesUpdated: 0,
      pagesLinked: 0,
      errors: [],
      skippedBySentinel: true,
    };
  }

  // Limpiar el centinela '!' para el análisis
  const cleanText = text.trim().startsWith('!') ? text.trim().slice(1).trim() : text;

  const stats = {
    inputLength: cleanText.length,
    conceptsFound: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesLinked: 0,
    errors: [],
  };

  logger.pipelineStart(cleanText.length);

  // ── Paso 1: Evaluación de importancia con Groq ──
  let extraction;
  try {
    extraction = await groqService.evaluateImportance(text);
  } catch (err) {
    logger.error('Error en evaluación de importancia:', err.message);
    stats.errors.push(`Evaluación fallida: ${err.message}`);
    logger.pipelineEnd(stats);
    return stats;
  }

  if (!extraction.isImportant || extraction.concepts.length === 0) {
    logger.info('🔚 No se encontraron conceptos relevantes. Pipeline terminado.');
    logger.pipelineEnd(stats);
    return stats;
  }

  stats.conceptsFound = extraction.concepts.length;

  // ── Paso 2: Procesar cada concepto ──
  for (const concept of extraction.concepts) {
    try {
      await processSingleConcept(concept, source, stats);
    } catch (err) {
      logger.error(`Error procesando concepto "${concept.name}":`, err.message);
      stats.errors.push(`${concept.name}: ${err.message}`);
    }
  }

  logger.pipelineEnd(stats);
  return stats;
}

/**
 * Procesa un solo concepto a través del pipeline completo.
 */
async function processSingleConcept(concept, source, stats) {
  logger.info(`\n${'─'.repeat(40)}`);
  logger.info(`📌 Procesando: "${concept.name}"`);

  // ── 2a: Buscar memorias relacionadas en Mem0 ──
  let relatedMemories = [];
  try {
    relatedMemories = await mem0Service.searchRelated(concept.summary || concept.name);
  } catch (err) {
    logger.warn(`No se pudieron buscar memorias relacionadas: ${err.message}`);
  }

  // ── 2b: Guardar en Mem0 ──
  let mem0Result;
  try {
    const memoryText = `${concept.name}: ${concept.summary}`;
    mem0Result = await mem0Service.addMemory(memoryText, {
      category: concept.category,
      source,
      tags: concept.tags?.join(', '),
    });
  } catch (err) {
    logger.warn(`No se pudo guardar en Mem0: ${err.message}`);
  }

  // Extraer el ID de Mem0 del resultado
  const mem0Id = extractMem0Id(mem0Result);

  // ── 2c: Decidir acción en Notion ──
  const existingPage = await notionService.findPageByConceptName(concept.name);

  // ── 2d: Generar contenido enriquecido con Groq ──
  let bodyContent = '';
  try {
    bodyContent = await groqService.generatePageContent(concept, relatedMemories);
  } catch (err) {
    logger.warn(`No se pudo generar contenido: ${err.message}`);
    bodyContent = `## Resumen\n${concept.summary}\n\n## Categoría\n${concept.category}`;
  }

  // ── 2e: Crear o actualizar en Notion ──
  const conceptData = {
    name: concept.name,
    category: concept.category,
    summary: concept.summary,
    source,
    tags: concept.tags || [],
    mem0Id: mem0Id || '',
    bodyContent,
  };

  if (existingPage) {
    // Actualizar página existente
    await notionService.updatePage(existingPage.id, {
      ...conceptData,
      status: '🌿 Creciendo', // Subir estado al actualizar
    });
    stats.pagesUpdated++;
    logger.saved(concept.name, existingPage.id);
  } else {
    // Crear nueva página
    const newPage = await notionService.createPage(conceptData);
    stats.pagesCreated++;
    logger.saved(concept.name, newPage.id);

    // ── Enlazar con páginas relacionadas si hay ──
    if (relatedMemories.length > 0) {
      const relatedPageIds = await findRelatedNotionPages(relatedMemories);
      if (relatedPageIds.length > 0) {
        await notionService.linkRelatedPages(newPage.id, relatedPageIds);
        stats.pagesLinked += relatedPageIds.length;
      }
    }
  }
}

/**
 * Extrae el ID de memoria del resultado de Mem0.
 */
function extractMem0Id(mem0Result) {
  if (!mem0Result) return null;

  // La estructura puede variar según la versión de Mem0
  if (mem0Result.results && mem0Result.results.length > 0) {
    return mem0Result.results[0].id || mem0Result.results[0].memory_id;
  }
  if (mem0Result.id) return mem0Result.id;
  if (mem0Result.memory_id) return mem0Result.memory_id;

  return null;
}

/**
 * Dado un array de memorias relacionadas de Mem0,
 * busca las páginas correspondientes en Notion para enlazarlas.
 */
async function findRelatedNotionPages(memories) {
  const pageIds = [];

  for (const mem of memories) {
    const memText = mem.memory || mem.text || mem.content || '';
    // Extraer el nombre del concepto (antes de los dos puntos si tiene formato "Concepto: descripción")
    const conceptName = memText.includes(':') ? memText.split(':')[0].trim() : memText.slice(0, 50).trim();

    if (conceptName) {
      try {
        const page = await notionService.findPageByConceptName(conceptName);
        if (page) {
          pageIds.push(page.id);
        }
      } catch {
        // Ignorar errores de búsqueda individual
      }
    }
  }

  return pageIds;
}
