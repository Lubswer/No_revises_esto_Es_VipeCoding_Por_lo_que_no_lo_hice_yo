import logger from './logger.js';

/**
 * Espera un número de milisegundos.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta una función con reintentos y backoff exponencial.
 *
 * @param {Function} fn - Función async a ejecutar.
 * @param {Object} options
 * @param {number} options.maxRetries - Número máximo de reintentos (default: 3).
 * @param {number} options.baseDelay - Delay base en ms (default: 1000).
 * @param {string} options.label - Etiqueta para logs (default: 'operación').
 * @returns {Promise<*>} Resultado de la función.
 */
export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, label = 'operación' } = {}) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded';
      const isRetryable = isRateLimit || error?.status >= 500;

      if (!isRetryable || attempt > maxRetries) {
        throw error;
      }

      // Extraer retry-after del header si existe
      const retryAfter = error?.headers?.['retry-after'];
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : baseDelay * Math.pow(2, attempt - 1);

      logger.warn(
        `⏳ ${label} — Reintento ${attempt}/${maxRetries} en ${delay}ms` +
        (isRateLimit ? ' (rate limit)' : ' (error del servidor)')
      );

      await sleep(delay);
    }
  }
}

/**
 * Rate limiter simple basado en tokens por ventana de tiempo.
 * Útil para respetar los límites de Notion (~3 req/seg).
 */
export class RateLimiter {
  /**
   * @param {number} maxRequests - Máximo de requests por ventana.
   * @param {number} windowMs - Ventana de tiempo en ms (default: 1000).
   */
  constructor(maxRequests, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  /**
   * Espera si es necesario para no exceder el rate limit.
   */
  async acquire() {
    const now = Date.now();

    // Limpiar timestamps fuera de la ventana
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldest) + 10; // +10ms de margen
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }

    this.timestamps.push(Date.now());
  }
}
