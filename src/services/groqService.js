import Groq from 'groq-sdk';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/rateLimiter.js';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from '../prompts/extractionPrompt.js';
import { CONTENT_SYSTEM_PROMPT, buildContentUserPrompt } from '../prompts/contentPrompt.js';

const groq = new Groq({ apiKey: config.groq.apiKey });

/**
 * Evalúa la importancia de un fragmento de conversación y extrae
 * conceptos de aprendizaje relevantes.
 *
 * @param {string} text - Texto crudo de conversación.
 * @returns {Promise<{isImportant: boolean, concepts: Array}>}
 */
export async function evaluateImportance(text) {
  logger.info('🧠 Groq: Evaluando importancia del texto...');

  const response = await withRetry(
    () =>
      groq.chat.completions.create({
        model: config.groq.model,
        temperature: config.groq.temperature,
        max_tokens: config.groq.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildExtractionUserPrompt(text) },
        ],
      }),
    { label: 'Groq evaluateImportance', maxRetries: 3 }
  );

  const content = response.choices[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);
    const conceptCount = parsed.concepts?.length || 0;

    if (conceptCount > 0) {
      logger.success(`Encontrados ${conceptCount} concepto(s) relevante(s)`);
    } else {
      logger.skipped('No se encontraron conceptos de aprendizaje relevantes');
    }

    return {
      isImportant: conceptCount > 0,
      concepts: parsed.concepts || [],
    };
  } catch (err) {
    logger.error('Error parseando respuesta de Groq:', err.message);
    logger.debug('Respuesta cruda:', content);
    return { isImportant: false, concepts: [] };
  }
}

/**
 * Genera contenido enriquecido para el body de una página de Notion.
 *
 * @param {Object} concept - Concepto extraído { name, category, summary }.
 * @param {Array} relatedMemories - Memorias relacionadas de Mem0.
 * @returns {Promise<string>} Contenido en formato markdown simplificado.
 */
export async function generatePageContent(concept, relatedMemories = []) {
  logger.info(`📝 Groq: Generando contenido para "${concept.name}"...`);

  const response = await withRetry(
    () =>
      groq.chat.completions.create({
        model: config.groq.model,
        temperature: 0.4, // Un poco más creativo para el contenido
        max_tokens: config.groq.maxTokens,
        messages: [
          { role: 'system', content: CONTENT_SYSTEM_PROMPT },
          { role: 'user', content: buildContentUserPrompt(concept, relatedMemories) },
        ],
      }),
    { label: 'Groq generatePageContent', maxRetries: 3 }
  );

  const content = response.choices[0]?.message?.content || '';
  logger.success(`Contenido generado (${content.length} chars)`);
  return content;
}
