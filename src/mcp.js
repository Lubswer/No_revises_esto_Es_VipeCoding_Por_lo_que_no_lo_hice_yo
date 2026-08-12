/**
 * Servidor MCP (Model Context Protocol) para el Agente de Memoria de Aprendizaje.
 *
 * Este servidor expone herramientas (tools) que cualquier cliente MCP
 * (Claude Desktop, Antigravity, Cursor, VS Code, etc.) puede usar
 * para guardar, buscar, leer y actualizar conceptos de aprendizaje
 * en Notion + Mem0.
 *
 * Transporte: STDIO (se lanza como proceso hijo por el cliente MCP).
 *
 * IMPORTANTE: En modo STDIO, NUNCA escribir a stdout (corrompería el protocolo).
 * Todo logging va a stderr vía console.error().
 *
 * Uso:
 *   node src/mcp.js
 *
 * Configuración en el cliente MCP (ej. claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "notion-learning-memory": {
 *         "command": "node",
 *         "args": ["C:/Users/usuario/Desktop/NotionAut/src/mcp.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ── Cargar config (silenciando logs a stderr) ──
import dotenv from 'dotenv';
dotenv.config();

// Validación manual de env vars (sin process.exit para no matar el MCP)
const requiredVars = ['GROQ_API_KEY', 'MEM0_API_KEY', 'NOTION_TOKEN', 'NOTION_DATABASE_ID'];
const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[MCP] ❌ Variables faltantes: ${missing.join(', ')}`);
  process.exit(1);
}

// Importar config y servicios DESPUÉS de cargar dotenv
const { default: config } = await import('./config.js');
const { 
  processConversation, 
  generatePreview, 
  queryBrain, 
  getLearningEvolution,
  hasSentinel, 
  hasQuerySentinel,
  hasStartSessionSentinel,
  hasCloseSessionSentinel,
  startStudySession,
  appendToStudySession,
  closeStudySession
} = await import('./pipeline.js');
const notionService = await import('./services/notionService.js');
const mem0Service = await import('./services/mem0Service.js');

// Redirigir todo el logging a stderr (no contaminar stdout/STDIO)
const originalLog = console.log;
console.log = (...args) => console.error('[MCP]', ...args);

// ── Inicializar servidor MCP ──
const server = new McpServer({
  name: 'notion-learning-memory',
  version: '1.3.0',
});

// ═══════════════════════════════════════════════════════
// TOOL SESSION START: Abrir sesión de estudio (!*)
// ═══════════════════════════════════════════════════════
server.tool(
  'start_study_session',
  'REGLA OBLIGATORIA: Activa esta herramienta SOLO si el mensaje del usuario comienza con "!*" (ejemplo: "!* Vamos a hablar sobre microservicios"). Abre una ventana de sesión de estudio grabada. A partir de este momento, RESPONDE NORMALLMENTE A TODAS LAS PREGUNTAS DEL USUARIO SIN PARAR A PREGUNTAR NI PROCESAR EN NOTION, hasta que el usuario envíe el comando de cierre "*!".',
  {
    topic_or_initial_text: z.string().describe('El mensaje que inicia con "!*"'),
  },
  async ({ topic_or_initial_text }) => {
    try {
      startStudySession('default', topic_or_initial_text);

      return {
        content: [
          {
            type: 'text',
            text: `🎬 **Sesión de Estudio iniciada**.\n\nA partir de este momento todo lo que conversemos será recopilado en memoria. La conversación fluirá 100% normal sin pausas.\n\nCuando desees finalizar y procesar todo lo aprendido hacia Notion, envía el comando: **\`*!\`**`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al iniciar sesión: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL SESSION CLOSE: Cerrar sesión y procesar (*!)
// ═══════════════════════════════════════════════════════
server.tool(
  'close_study_session',
  'REGLA OBLIGATORIA: Activa esta herramienta SOLO si el mensaje del usuario comienza con "*!" (ejemplo: "*!"). Cierra la ventana de sesión de estudio, toma TODA la transcripción acumulada de la charla, la analiza con Groq y Mem0, y presenta la VISTA PREVIA COMPLETA de las notas propuestas para Notion, pidiendo confirmación al usuario antes de guardarlas con confirm_save.',
  {
    closing_text: z.string().optional().describe('El texto de cierre que inicia con "*!"'),
  },
  async () => {
    try {
      const previewResult = await closeStudySession('default', 'Sesión de Estudio');

      if (!previewResult.hasConcepts) {
        return {
          content: [
            {
              type: 'text',
              text: `🏁 **Sesión de estudio finalizada.**\n\nℹ️ ${previewResult.message}\n(No se realizará ningún cambio en Notion).`,
            },
          ],
        };
      }

      const outputLines = [
        `🏁 **SESIÓN DE ESTUDIO FINALIZADA (*!)**`,
        `📊 Mensajes procesados: ${previewResult.sessionStats?.messageCount || 0} (${previewResult.sessionStats?.transcriptLength || 0} caracteres)`,
        `---`,
        `📋 **PROPUESTA DE GUARDADO EN NOTION**`,
        `---`,
      ];

      previewResult.previews.forEach((p, i) => {
        const actionLabel = p.action === 'CREATE' ? '🆕 CREAR PÁGINA NUEVA' : '🔄 ACTUALIZAR PÁGINA EXISTENTE';
        outputLines.push(`### Concepto ${i + 1}: ${p.concept.name}`);
        outputLines.push(`* **Acción:** ${actionLabel}`);
        outputLines.push(`* **Categoría:** \`${p.concept.category}\``);
        outputLines.push(`* **Resumen:** ${p.concept.summary}`);
        outputLines.push(`* **Tags:** ${p.concept.tags.join(', ') || 'ninguno'}`);
        outputLines.push(`* **Memorias afines en Mem0:** ${p.relatedMemoriesCount}`);
        outputLines.push(``);
        outputLines.push(`**Vista previa del contenido para el body:**`);
        outputLines.push(`\`\`\`markdown`);
        outputLines.push(p.concept.bodyContent.slice(0, 400) + (p.concept.bodyContent.length > 400 ? '\n...' : ''));
        outputLines.push(`\`\`\``);
        outputLines.push(`---`);
      });

      outputLines.push(``);
      outputLines.push(`❓ **¿Deseas confirmar la creación/actualización de estas notas recopiladas de la sesión en Notion?**`);

      return {
        content: [{ type: 'text', text: outputLines.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al cerrar sesión de estudio: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 0: Consulta directa a la Base de Conocimiento (!?)
// ═══════════════════════════════════════════════════════
server.tool(
  'query_brain',
  'REGLA OBLIGATORIA: Activa esta herramienta SOLO si el mensaje del usuario comienza con el centinela "!?" (ejemplo: "!? ¿Qué sé sobre Closures?"). Esta herramienta realiza una consulta completa a Notion y Mem0, y devuelve la respuesta redactada basándose EXCLUSIVAMENTE en la base de datos del usuario, sin que la IA externa use su propio conocimiento predeterminado.',
  {
    question: z.string().describe('La pregunta del usuario que inicia con "!?"'),
  },
  async ({ question }) => {
    try {
      const result = await queryBrain(question);

      if (!result.found) {
        return {
          content: [{ type: 'text', text: result.answer }],
        };
      }

      const sourcesText = result.sourcePages.length > 0
        ? `\n\n📌 *Origen: ${result.sourcePages.map(p => p.name).join(', ')}*`
        : '';

      return {
        content: [{ type: 'text', text: `${result.answer}${sourcesText}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error consultando la base de conocimiento: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 1: Vista previa de aprendizaje (Paso 1)
// ═══════════════════════════════════════════════════════
server.tool(
  'preview_learning',
  'Genera una VISTA PREVIA de los conceptos de aprendizaje identificados y el contenido que se guardaría en Notion, SIN modificar nada todavía. REGLA OBLIGATORIA: Activa esta herramienta SOLO si el mensaje del usuario comienza con el centinela "!" (ejemplo: "! Explícame X") o si el usuario pide explícitamente analizar/guardar un tema en Notion. Después de obtener la vista previa, MUESTRA la propuesta al usuario en el chat y PIDE su confirmación antes de llamar a confirm_save.',
  {
    conversation_text: z.string().describe('El texto de la conversación que inicia con "!" o contiene conceptos de aprendizaje.'),
    source: z.string().optional().describe('Fuente de la conversación (ej: "Chat con Claude"). Por defecto: "Chat externo".'),
  },
  async ({ conversation_text, source }) => {
    try {
      // Validar centinela '!'
      const isSentinel = hasSentinel(conversation_text);

      const previewResult = await generatePreview(conversation_text, {
        source: source || 'Chat externo',
      });

      if (!previewResult.hasConcepts) {
        return {
          content: [
            {
              type: 'text',
              text: `ℹ️ ${previewResult.message}\n(No se realizará ningún cambio en Notion).`,
            },
          ],
        };
      }

      const outputLines = [
        `📋 **PROPUESTA DE GUARDADO EN NOTION** ${isSentinel ? '(Detectado centinela !)' : ''}`,
        `---`,
      ];

      previewResult.previews.forEach((p, i) => {
        const actionLabel = p.action === 'CREATE' ? '🆕 CREAR PÁGINA NUEVA' : '🔄 ACTUALIZAR PÁGINA EXISTENTE';
        outputLines.push(`### Concepto ${i + 1}: ${p.concept.name}`);
        outputLines.push(`* **Acción:** ${actionLabel}`);
        outputLines.push(`* **Categoría:** \`${p.concept.category}\``);
        outputLines.push(`* **Resumen:** ${p.concept.summary}`);
        outputLines.push(`* **Tags:** ${p.concept.tags.join(', ') || 'ninguno'}`);
        outputLines.push(`* **Memorias afines en Mem0:** ${p.relatedMemoriesCount}`);
        outputLines.push(``);
        outputLines.push(`**Vista previa del contenido para el body:**`);
        outputLines.push(`\`\`\`markdown`);
        outputLines.push(p.concept.bodyContent.slice(0, 500) + (p.concept.bodyContent.length > 500 ? '\n...' : ''));
        outputLines.push(`\`\`\``);
        outputLines.push(`---`);
      });

      outputLines.push(``);
      outputLines.push(`❓ **¿Deseas confirmar la creación/actualización de estas notas en Notion?**`);
      outputLines.push(`Si estás de acuerdo, avísame para ejecutar la confirmación.`);

      return {
        content: [{ type: 'text', text: outputLines.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al generar vista previa: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 2: Confirmar y guardar en Notion (Paso 2)
// ═══════════════════════════════════════════════════════
server.tool(
  'confirm_save',
  'Ejecuta el guardado REAL en Notion y Mem0 una vez que el usuario ha revisado y APROBADO la vista previa de la herramienta preview_learning. NUNCA llames a esta herramienta sin la confirmación explícita del usuario.',
  {
    conversation_text: z.string().describe('El texto de la conversación a procesar definitivamente.'),
    source: z.string().optional().describe('Fuente de la conversación.'),
  },
  async ({ conversation_text, source }) => {
    try {
      const stats = await processConversation(conversation_text, {
        source: source || 'Chat externo (Confirmado)',
      });

      const summary = [
        `🎉 **¡Guardado en Notion completado con éxito!**`,
        `---`,
        `- 📝 Conceptos procesados: ${stats.conceptsFound}`,
        `- 🆕 Páginas creadas: ${stats.pagesCreated}`,
        `- 🔄 Páginas actualizadas: ${stats.pagesUpdated}`,
        `- 🔗 Relaciones establecidas: ${stats.pagesLinked}`,
      ];

      if (stats.errors.length > 0) {
        summary.push(`- ⚠️ Errores: ${stats.errors.join('; ')}`);
      }

      return {
        content: [{ type: 'text', text: summary.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al confirmar guardado: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 2: Buscar conceptos en Notion
// ═══════════════════════════════════════════════════════
server.tool(
  'search_concepts',
  'Busca conceptos de aprendizaje previamente guardados en la base de datos de Notion. Usa esta herramienta cuando el usuario pregunte "¿Qué aprendí sobre X?", "¿Tengo notas de Y?", o quiera recordar un tema específico.',
  {
    query: z.string().describe('Texto a buscar en los nombres de conceptos (búsqueda parcial).'),
    limit: z.number().optional().describe('Máximo de resultados a devolver (default: 10).'),
  },
  async ({ query, limit }) => {
    try {
      const results = await notionService.searchConcepts(query, limit || 10);

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No encontré conceptos que contengan "${query}" en tu base de conocimiento.` }],
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.name}** [${r.category}]\n` +
            `   📝 ${r.summary}\n` +
            `   🏷️ Tags: ${r.tags.join(', ') || 'ninguno'}\n` +
            `   📅 ${r.date} | Estado: ${r.status}\n` +
            `   🔑 ID: ${r.id}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Encontré ${results.length} concepto(s) para "${query}":\n\n${formatted}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al buscar: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 3: Leer contenido completo de un concepto
// ═══════════════════════════════════════════════════════
server.tool(
  'read_concept',
  'Lee el contenido completo de un concepto específico de Notion, incluyendo sus propiedades y el texto del body. Usa esta herramienta después de buscar un concepto (con search_concepts) para ver su contenido detallado.',
  {
    page_id: z.string().describe('El ID de la página de Notion a leer (obtenido de search_concepts).'),
  },
  async ({ page_id }) => {
    try {
      const page = await notionService.getPageContent(page_id);

      const output = [
        `# ${page.name}`,
        ``,
        `📂 **Categoría:** ${page.category}`,
        `📝 **Resumen:** ${page.summary}`,
        `📎 **Fuente:** ${page.source}`,
        `📅 **Fecha:** ${page.date}`,
        `🌱 **Estado:** ${page.status}`,
        `🏷️ **Tags:** ${page.tags.join(', ') || 'ninguno'}`,
        ``,
        `---`,
        ``,
        page.bodyContent || '(Sin contenido en el body)',
      ];

      return {
        content: [{ type: 'text', text: output.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al leer: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 4: Listar todos los conceptos
// ═══════════════════════════════════════════════════════
server.tool(
  'list_concepts',
  'Lista todos los conceptos de aprendizaje guardados en Notion, ordenados por fecha (más recientes primero). Usa esta herramienta cuando el usuario quiera ver "todo lo que ha aprendido", un resumen general, o explorar su base de conocimiento.',
  {
    limit: z.number().optional().describe('Máximo de resultados (default: 20).'),
  },
  async ({ limit }) => {
    try {
      const results = await notionService.listAllConcepts(limit || 20);

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'Tu base de conocimiento está vacía. ¡Empieza a guardar conceptos con save_learning!' }],
        };
      }

      const formatted = results
        .map(
          (r, i) => `${i + 1}. **${r.name}** [${r.category}] — ${r.status} (${r.date})`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📚 Tu base de conocimiento (${results.length} conceptos):\n\n${formatted}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al listar: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 5: Buscar en la memoria semántica (Mem0)
// ═══════════════════════════════════════════════════════
server.tool(
  'search_memory',
  'Busca en la memoria semántica (Mem0) conceptos relacionados con una consulta. A diferencia de search_concepts (que busca por nombre exacto en Notion), esta herramienta busca por SIGNIFICADO semántico — útil cuando no recuerdas el nombre exacto de un concepto pero sí la idea general.',
  {
    query: z.string().describe('Descripción de lo que quieres buscar (búsqueda semántica).'),
    limit: z.number().optional().describe('Máximo de resultados (default: 5).'),
  },
  async ({ query, limit }) => {
    try {
      const results = await mem0Service.searchRelated(query, limit || 5);

      if (!results || results.length === 0) {
        return {
          content: [{ type: 'text', text: `No encontré memorias semánticamente relacionadas con "${query}".` }],
        };
      }

      const formatted = results
        .map((r, i) => {
          const text = r.memory || r.text || r.content || JSON.stringify(r);
          const score = r.score ? ` (relevancia: ${(r.score * 100).toFixed(0)}%)` : '';
          return `${i + 1}. ${text}${score}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `🧠 Memorias relacionadas con "${query}":\n\n${formatted}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error en búsqueda semántica: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 6: Consultar Logs del Sistema
// ═══════════════════════════════════════════════════════
server.tool(
  'get_system_logs',
  'Obtiene las últimas entradas de los archivos de log del sistema (activity.log, queries.log, error.log) para auditar la actividad o revisar errores.',
  {
    log_type: z.enum(['activity', 'queries', 'error']).optional().describe('Tipo de log a consultar (default: activity).'),
    lines: z.number().optional().describe('Número de líneas recientes (default: 15).'),
  },
  async ({ log_type, lines }) => {
    try {
      const type = log_type || 'activity';
      const recentLogs = logger.default.getRecentLogs(type, lines || 15);

      return {
        content: [
          {
            type: 'text',
            text: `📊 **Últimas ${recentLogs.length} líneas de ${type}.log:**\n\n\`\`\`\n${recentLogs.join('\n')}\n\`\`\``,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error leyendo logs: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 7: Vaciar Base de Datos (Notion + Mem0)
// ═══════════════════════════════════════════════════════
server.tool(
  'clear_brain',
  'REGLA OBLIGATORIA: Ejecuta el vaciado y purga completa de Notion (archivando todas las páginas) y de Mem0 (borrando el historial de memorias). Usa esta herramienta cuando el usuario pida "!? Borra las páginas de Notion y vacía la memoria de Mem0".',
  {},
  async () => {
    try {
      const notionCount = await notionService.clearAllPages();
      const mem0Count = await mem0Service.clearAllMemories();

      return {
        content: [
          {
            type: 'text',
            text: `🧹 **Purga completa ejecutada con éxito:**\n\n- 🗑️ Páginas archivadas en Notion: ${notionCount}\n- 🧠 Memorias eliminadas en Mem0: ${mem0Count}\n\n✨ Tu base de datos y memoria han quedado 100% limpias.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al vaciar la base de datos: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 8: Evolución de Aprendizaje & Radar Metacognitivo
// ═══════════════════════════════════════════════════════
server.tool(
  'get_learning_evolution',
  'Muestra la evolución del aprendizaje del usuario, sus preguntas pasadas, los puntos de fricción (conceptos que más costaron aprender) y el mapa de relaciones interconectadas. Usa esta herramienta cuando el usuario pregunte "!? ¿Cómo ha sido mi evolución en [tema]?" o quiera revisar su progreso.',
  {
    topic: z.string().optional().describe('Tema o área para filtrar la evolución (ej: "Arquitectura", "Redis", o vacío para todo)'),
  },
  async ({ topic }) => {
    try {
      const result = await getLearningEvolution(topic || '');

      if (!result.found) {
        return {
          content: [{ type: 'text', text: `ℹ️ ${result.message}` }],
        };
      }

      return {
        content: [{ type: 'text', text: result.report }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Error al consultar evolución: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Conectar transporte STDIO ──
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[MCP] ✅ Servidor MCP "notion-learning-memory" conectado vía STDIO');
