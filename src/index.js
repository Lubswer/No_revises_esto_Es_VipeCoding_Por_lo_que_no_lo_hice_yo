import { readFileSync } from 'fs';
import config from './config.js';
import logger from './utils/logger.js';
import { processConversation } from './pipeline.js';
import * as notionService from './services/notionService.js';
import * as mem0Service from './services/mem0Service.js';
import express from 'express';

const args = process.argv.slice(2);

// ─── Modo CLI ──────────────────────────────────────────────────────

if (args.includes('--text')) {
  // Modo: node src/index.js --text "tu texto aquí"
  const textIndex = args.indexOf('--text') + 1;
  const text = args[textIndex];

  if (!text) {
    console.error('❌ Uso: node src/index.js --text "tu conversación aquí"');
    process.exit(1);
  }

  logger.info(`📋 Modo CLI — Procesando texto directo (${text.length} chars)`);
  const stats = await processConversation(text, { source: 'CLI' });

  if (stats.errors.length > 0) {
    logger.warn(`⚠️ Se completó con ${stats.errors.length} error(es)`);
    process.exit(1);
  }

  process.exit(0);
}

if (args.includes('--file')) {
  // Modo: node src/index.js --file conversacion.txt
  const fileIndex = args.indexOf('--file') + 1;
  const filePath = args[fileIndex];

  if (!filePath) {
    console.error('❌ Uso: node src/index.js --file ruta/al/archivo.txt');
    process.exit(1);
  }

  try {
    const text = readFileSync(filePath, 'utf-8');
    logger.info(`📋 Modo CLI — Procesando archivo "${filePath}" (${text.length} chars)`);
    const stats = await processConversation(text, { source: `Archivo: ${filePath}` });

    if (stats.errors.length > 0) {
      logger.warn(`⚠️ Se completó con ${stats.errors.length} error(es)`);
      process.exit(1);
    }
  } catch (err) {
    logger.error(`No se pudo leer el archivo: ${err.message}`);
    process.exit(1);
  }

  process.exit(0);
}

// ─── Modo Servidor ──────────────────────────────────────────────────

if (args.includes('--serve')) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /**
   * POST /process
   * Body: { "text": "tu conversación aquí", "source": "opcional" }
   */
  app.post('/process', async (req, res) => {
    const { text, source } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'El campo "text" es requerido y debe ser un string no vacío.',
      });
    }

    try {
      const stats = await processConversation(text.trim(), {
        source: source || 'API',
      });

      const hasErrors = stats.errors.length > 0;
      res.status(hasErrors ? 207 : 200).json({
        success: !hasErrors,
        stats,
        message: hasErrors
          ? `Procesado con ${stats.errors.length} error(es)`
          : `✅ ${stats.pagesCreated} página(s) creada(s), ${stats.pagesUpdated} actualizada(s)`,
      });
    } catch (err) {
      logger.error('Error en /process:', err.message);
      res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
  });

  /**
   * POST /search
   * Body: { "query": "closures", "limit": 10 }
   * Busca conceptos por nombre parcial en Notion.
   */
  app.post('/search', async (req, res) => {
    const { query, limit } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'El campo "query" es requerido.' });
    }

    try {
      const results = await notionService.searchConcepts(query.trim(), limit || 10);
      res.json({ count: results.length, results });
    } catch (err) {
      logger.error('Error en /search:', err.message);
      res.status(500).json({ error: 'Error al buscar', details: err.message });
    }
  });

  /**
   * POST /search/semantic
   * Body: { "query": "cómo funcionan las promesas", "limit": 5 }
   * Búsqueda semántica en Mem0.
   */
  app.post('/search/semantic', async (req, res) => {
    const { query, limit } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'El campo "query" es requerido.' });
    }

    try {
      const results = await mem0Service.searchRelated(query.trim(), limit || 5);
      res.json({ count: results.length, results });
    } catch (err) {
      logger.error('Error en /search/semantic:', err.message);
      res.status(500).json({ error: 'Error en búsqueda semántica', details: err.message });
    }
  });

  /**
   * GET /concept/:id
   * Lee el contenido completo de una página de Notion.
   */
  app.get('/concept/:id', async (req, res) => {
    try {
      const page = await notionService.getPageContent(req.params.id);
      res.json(page);
    } catch (err) {
      logger.error('Error en /concept:', err.message);
      res.status(500).json({ error: 'Error al leer concepto', details: err.message });
    }
  });

  /**
   * GET /concepts
   * Lista todos los conceptos (más recientes primero).
   */
  app.get('/concepts', async (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    try {
      const results = await notionService.listAllConcepts(limit);
      res.json({ count: results.length, results });
    } catch (err) {
      logger.error('Error en /concepts:', err.message);
      res.status(500).json({ error: 'Error al listar', details: err.message });
    }
  });

  /**
   * GET /logs
   * Obtiene las últimas entradas de los archivos de log.
   * Query params: type=activity|queries|error, lines=20
   */
  app.get('/logs', (req, res) => {
    const type = req.query.type || 'activity';
    const lines = parseInt(req.query.lines || '20', 10);
    const logs = logger.getRecentLogs(type, lines);
    res.json({ type, count: logs.length, logs });
  });

  /**
   * GET /health
   * Health check simple.
   */
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        groq: '✅ Configurado',
        mem0: '✅ Configurado',
        notion: '✅ Configurado',
      },
    });
  });

  app.listen(config.port, () => {
    logger.info(`\n${'═'.repeat(50)}`);
    logger.info(`🚀 Servidor de Memoria de Aprendizaje`);
    logger.info(`   http://localhost:${config.port}`);
    logger.info(``);
    logger.info(`   POST /process          — Procesar conversación`);
    logger.info(`   POST /search           — Buscar conceptos por nombre`);
    logger.info(`   POST /search/semantic  — Búsqueda semántica (Mem0)`);
    logger.info(`   GET  /concepts         — Listar todos los conceptos`);
    logger.info(`   GET  /concept/:id      — Leer concepto completo`);
    logger.info(`   GET  /health           — Health check`);
    logger.info(`${'═'.repeat(50)}\n`);
  });
} else {
  // Sin argumentos válidos → mostrar ayuda
  console.log(`
╔══════════════════════════════════════════════════╗
║   🧠 Agente de Memoria de Aprendizaje Personal  ║
║      Groq + Mem0 + Notion                        ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  Uso:                                            ║
║                                                  ║
║  Modo texto directo:                             ║
║    node src/index.js --text "tu texto aquí"      ║
║                                                  ║
║  Modo archivo:                                   ║
║    node src/index.js --file conversacion.txt      ║
║                                                  ║
║  Modo servidor:                                  ║
║    node src/index.js --serve                     ║
║    → POST http://localhost:3000/process           ║
║      Body: { "text": "tu conversación" }         ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
}
