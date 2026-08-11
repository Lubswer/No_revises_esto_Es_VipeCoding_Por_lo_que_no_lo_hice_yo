import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');

// Asegurar que el directorio logs/ exista
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

const ACTIVITY_LOG = join(LOGS_DIR, 'activity.log');
const QUERIES_LOG = join(LOGS_DIR, 'queries.log');
const ERROR_LOG = join(LOGS_DIR, 'error.log');

const LEVELS = {
  info: { label: 'INFO', color: '\x1b[36m' },    // Cyan
  success: { label: '  OK', color: '\x1b[32m' },  // Green
  warn: { label: 'WARN', color: '\x1b[33m' },     // Yellow
  error: { label: ' ERR', color: '\x1b[31m' },     // Red
  debug: { label: 'DBUG', color: '\x1b[90m' },     // Gray
};

const RESET = '\x1b[0m';

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Escribe un mensaje en la consola y en el archivo de log correspondiente.
 */
function log(level, message, data = null, targetFile = ACTIVITY_LOG) {
  const { label, color } = LEVELS[level] || LEVELS.info;
  const ts = timestamp();
  const consolePrefix = `${color}[${label}]${RESET} ${ts}`;
  const filePrefix = `[${label}] ${ts}`;

  let dataStr = '';
  if (data) {
    dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
  }

  // 1. Imprimir en consola con colores
  if (data) {
    console.log(`${consolePrefix} ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.log(`${consolePrefix} ${message}`);
  }

  // 2. Escribir en archivo de log físico (sin códigos de colores ANSI)
  try {
    const fileLine = `${filePrefix} ${message}${dataStr ? ' | Data: ' + dataStr : ''}\n`;
    appendFileSync(targetFile, fileLine, 'utf-8');
  } catch (err) {
    console.error(`[ERR] ${ts} No se pudo escribir en log: ${err.message}`);
  }
}

const logger = {
  info: (msg, data) => log('info', msg, data, ACTIVITY_LOG),
  success: (msg, data) => log('success', msg, data, ACTIVITY_LOG),
  warn: (msg, data) => log('warn', msg, data, ACTIVITY_LOG),
  debug: (msg, data) => log('debug', msg, data, ACTIVITY_LOG),

  /** Registra errores específicos en error.log y activity.log */
  error: (msg, data) => {
    log('error', msg, data, ERROR_LOG);
    log('error', msg, data, ACTIVITY_LOG);
  },

  /** Log específico para guardar/actualizar en Notion */
  saved: (conceptName, pageId, action = 'CREATE') => {
    const icon = action === 'CREATE' ? '🆕' : '🔄';
    log('success', `${icon} Guardado en Notion: "${conceptName}" (ID: ${pageId})`, { action, pageId }, ACTIVITY_LOG);
  },

  /** Log específico para consultas al cerebro (!?) */
  query: (question, foundCount, sourcePages = []) => {
    const pagesStr = sourcePages.map((p) => p.name).join(', ');
    log('info', `❓ Consulta Brain (!?): "${question}" | Encontradas: ${foundCount} nota(s) [${pagesStr}]`, { question, foundCount, pagesStr }, QUERIES_LOG);
  },

  /** Log específico para conceptos omitidos */
  skipped: (reason) => {
    log('debug', `⏭️ Omitido: ${reason}`, null, ACTIVITY_LOG);
  },

  /** Inicio de pipeline */
  pipelineStart: (textLength) => {
    log('info', `\n${'═'.repeat(50)}`, null, ACTIVITY_LOG);
    log('info', `🚀 Pipeline iniciado — ${textLength} caracteres de entrada`, null, ACTIVITY_LOG);
    log('info', `${'═'.repeat(50)}`, null, ACTIVITY_LOG);
  },

  /** Fin de pipeline */
  pipelineEnd: (stats) => {
    log('info', `${'─'.repeat(50)}`, null, ACTIVITY_LOG);
    log('info', `✅ Pipeline completado:`, stats, ACTIVITY_LOG);
    log('info', `${'═'.repeat(50)}\n`, null, ACTIVITY_LOG);
  },

  /**
   * Lee las últimas N líneas de un archivo de log para auditoría.
   *
   * @param {string} logType - 'activity' | 'queries' | 'error'
   * @param {number} linesCount - Número de líneas recientes (default: 20)
   * @returns {string[]} Líneas de log
   */
  getRecentLogs: (logType = 'activity', linesCount = 20) => {
    let filePath = ACTIVITY_LOG;
    if (logType === 'queries') filePath = QUERIES_LOG;
    if (logType === 'error') filePath = ERROR_LOG;

    if (!existsSync(filePath)) return [`(Archivo ${logType}.log vacío o no existe)`];

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-linesCount);
    } catch (err) {
      return [`Error leyendo log ${logType}: ${err.message}`];
    }
  },
};

export default logger;
