import MemoryClient from 'mem0ai';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry } from '../utils/rateLimiter.js';

const client = new MemoryClient({ apiKey: config.mem0.apiKey });

/**
 * Agrega un concepto como memoria en Mem0.
 * Mem0 se encarga de extracción, deduplicación y decisión ADD/UPDATE/NOOP.
 *
 * @param {string} text - Texto del concepto/memoria a guardar.
 * @param {Object} metadata - Metadata adicional { category, source }.
 * @returns {Promise<Object>} Resultado de Mem0 con IDs de memorias afectadas.
 */
export async function addMemory(text, metadata = {}) {
  logger.info('💾 Mem0: Guardando memoria...');

  const result = await withRetry(
    () =>
      client.add(
        [{ role: 'user', content: text }],
        {
          user_id: config.userId,
          metadata: {
            type: 'learning_concept',
            ...metadata,
          },
        }
      ),
    { label: 'Mem0 addMemory', maxRetries: 3 }
  );

  logger.success(`Mem0: Memoria procesada`, {
    results: result?.results?.length || 0,
  });

  return result;
}

/**
 * Busca memorias semánticamente similares a un concepto.
 *
 * @param {string} query - Texto del concepto a buscar.
 * @param {number} limit - Número máximo de resultados (default: 5).
 * @returns {Promise<Array>} Lista de memorias relacionadas con score.
 */
export async function searchRelated(query, limit = 5) {
  logger.info(`🔍 Mem0: Buscando memorias relacionadas con "${query.slice(0, 50)}..."...`);

  const results = await withRetry(
    () =>
      client.search(query, {
        filters: { user_id: config.userId },
        limit,
      }),
    { label: 'Mem0 searchRelated', maxRetries: 3 }
  );

  const memories = results?.results || results || [];
  logger.info(`Mem0: Encontradas ${memories.length} memorias relacionadas`);

  return memories;
}

/**
 * Lista todas las memorias del usuario.
 *
 * @returns {Promise<Array>} Todas las memorias del usuario.
 */
export async function getAllMemories() {
  logger.info('📋 Mem0: Listando todas las memorias...');

  const results = await withRetry(
    () => client.getAll({ filters: { user_id: config.userId } }),
    { label: 'Mem0 getAllMemories', maxRetries: 3 }
  );

  const memories = results?.results || results || [];
  logger.info(`Mem0: Total de memorias: ${memories.length}`);

  return memories;
}

/**
 * Elimina una memoria específica.
 *
 * @param {string} memoryId - ID de la memoria a eliminar.
 * @returns {Promise<Object>} Resultado de la eliminación.
 */
export async function deleteMemory(memoryId) {
  logger.info(`🗑️ Mem0: Eliminando memoria ${memoryId}...`);

  const result = await withRetry(
    () => client.delete(memoryId),
    { label: 'Mem0 deleteMemory', maxRetries: 3 }
  );

  logger.success(`Mem0: Memoria ${memoryId} eliminada`);
  return result;
}

/**
 * Elimina todas las memorias del usuario en Mem0.
 *
 * @returns {Promise<number>} Cantidad de memorias eliminadas.
 */
export async function clearAllMemories() {
  logger.info('🧹 Mem0: Eliminando todas las memorias...');
  try {
    const memories = await searchRelated('', 50);
    let count = 0;
    if (Array.isArray(memories)) {
      for (const m of memories) {
        if (m.id) {
          await deleteMemory(m.id);
          count++;
        }
      }
    }
    logger.success(`Mem0: ${count} memorias eliminadas`);
    return count;
  } catch (err) {
    logger.warn(`Mem0: Proceso de eliminación completado (${err.message})`);
    return 0;
  }
}
