import { Client } from '@notionhq/client';
import config from '../config.js';
import logger from '../utils/logger.js';
import { withRetry, RateLimiter } from '../utils/rateLimiter.js';
import { markdownToBlocks, callout, divider } from '../utils/notionBlockBuilder.js';

const notion = new Client({ auth: config.notion.token });
const rateLimiter = new RateLimiter(3, 1000); // 3 requests por segundo

/**
 * Crea una nueva página en la base de datos de Notion.
 *
 * @param {Object} conceptData
 * @param {string} conceptData.name - Nombre del concepto.
 * @param {string} conceptData.category - Categoría (select).
 * @param {string} conceptData.summary - Resumen breve.
 * @param {string} conceptData.source - Fuente de la información.
 * @param {string[]} conceptData.tags - Tags del concepto.
 * @param {string} conceptData.mem0Id - ID de Mem0 para sincronización.
 * @param {string} conceptData.bodyContent - Contenido markdown para el body.
 * @returns {Promise<Object>} Página creada en Notion.
 */
const CATEGORY_ICONS = {
  'Programación': '💻',
  'Arquitectura': '🏛️',
  'DevOps': '⚙️',
  'IA/ML': '🧠',
  'Base de Datos': '🗄️',
  'Frontend': '🎨',
  'Backend': '🚀',
  'Redes': '🌐',
  'Seguridad': '🔐',
  'Diseño': '✨',
  'Metodología': '📋',
  'Concepto General': '📚',
};

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || '💡';
}

/**
 * Crea una nueva página en la base de datos de Notion.
 *
 * @param {Object} conceptData
 * @param {string} conceptData.name - Nombre del concepto.
 * @param {string} conceptData.category - Categoría (select).
 * @param {string} conceptData.summary - Resumen breve.
 * @param {string} conceptData.source - Fuente de la información.
 * @param {string[]} conceptData.tags - Tags del concepto.
 * @param {string} conceptData.mem0Id - ID de Mem0 para sincronización.
 * @param {string} conceptData.bodyContent - Contenido markdown para el body.
 * @returns {Promise<Object>} Página creada en Notion.
 */
export async function createPage(conceptData) {
  logger.info(`📄 Notion: Creando página "${conceptData.name}" con icono...`);

  await rateLimiter.acquire();

  const iconEmoji = getCategoryIcon(conceptData.category);

  const page = await withRetry(
    () =>
      notion.pages.create({
        parent: { database_id: config.notion.databaseId },
        icon: {
          type: 'emoji',
          emoji: iconEmoji,
        },
        properties: buildProperties(conceptData),
      }),
    { label: 'Notion createPage', maxRetries: 3 }
  );

  logger.success(`Notion: Página creada con icono ${iconEmoji} e ID ${page.id}`);

  // Escribir contenido en el body de la página
  if (conceptData.bodyContent) {
    await appendContent(page.id, conceptData.bodyContent);
  }

  return page;
}

/**
 * Actualiza las propiedades y contenido de una página existente.
 *
 * @param {string} pageId - ID de la página en Notion.
 * @param {Object} updatedData - Datos actualizados.
 * @returns {Promise<Object>} Página actualizada.
 */
export async function updatePage(pageId, updatedData) {
  logger.info(`✏️ Notion: Actualizando página ${pageId}...`);

  await rateLimiter.acquire();

  const page = await withRetry(
    () =>
      notion.pages.update({
        page_id: pageId,
        properties: buildProperties(updatedData),
      }),
    { label: 'Notion updatePage', maxRetries: 3 }
  );

  // Si incluye bodyContent, escribir el contenido enriquecido
  if (updatedData.bodyContent) {
    await appendContent(page.id, updatedData.bodyContent);
  }

  logger.success(`Notion: Página ${pageId} actualizada con contenido`);
  return page;
}

/**
 * Escribe contenido en el body de una página.
 *
 * @param {string} pageId - ID de la página.
 * @param {string} markdownContent - Contenido en formato markdown simplificado.
 */
export async function appendContent(pageId, markdownContent) {
  logger.info(`📝 Notion: Escribiendo contenido en página ${pageId}...`);

  const blocks = markdownToBlocks(markdownContent);

  // Notion acepta máximo 100 bloques por llamada
  const chunks = chunkArray(blocks, 100);

  for (const chunk of chunks) {
    await rateLimiter.acquire();

    await withRetry(
      () =>
        notion.blocks.children.append({
          block_id: pageId,
          children: chunk,
        }),
      { label: 'Notion appendContent', maxRetries: 3 }
    );
  }

  logger.success(`Notion: ${blocks.length} bloques escritos en página ${pageId}`);
}

/**
 * Busca si ya existe una página con un nombre de concepto dado.
 *
 * @param {string} conceptName - Nombre del concepto a buscar.
 * @returns {Promise<Object|null>} Página encontrada o null.
 */
export async function findPageByConceptName(conceptName) {
  logger.info(`🔎 Notion: Buscando página existente para "${conceptName}"...`);

  await rateLimiter.acquire();

  const response = await withRetry(
    () =>
      notion.databases.query({
        database_id: config.notion.databaseId,
        filter: {
          property: 'Concepto',
          title: {
            equals: conceptName,
          },
        },
      }),
    { label: 'Notion findPage', maxRetries: 3 }
  );

  if (response.results.length > 0) {
    logger.info(`Notion: Encontrada página existente para "${conceptName}"`);
    return response.results[0];
  }

  logger.debug(`Notion: No existe página para "${conceptName}"`);
  return null;
}

/**
 * Enlaza páginas relacionadas vía propiedad Relation.
 *
 * @param {string} pageId - ID de la página principal.
 * @param {string[]} relatedPageIds - IDs de las páginas relacionadas.
 */
export async function linkRelatedPages(pageId, relatedPageIds) {
  if (!relatedPageIds || relatedPageIds.length === 0) return;

  logger.info(`🔗 Notion: Enlazando ${relatedPageIds.length} páginas relacionadas...`);

  await rateLimiter.acquire();

  await withRetry(
    () =>
      notion.pages.update({
        page_id: pageId,
        properties: {
          Relacionados: {
            relation: relatedPageIds.map((id) => ({ id })),
          },
        },
      }),
    { label: 'Notion linkRelatedPages', maxRetries: 3 }
  );

  logger.success(`Notion: ${relatedPageIds.length} relaciones establecidas`);
}

// ─── Funciones de consulta/lectura ────────────────────────────────

/**
 * Busca conceptos en la base de datos de Notion por texto parcial.
 *
 * @param {string} query - Texto a buscar.
 * @param {number} limit - Máximo de resultados (default: 10).
 * @returns {Promise<Array>} Lista de páginas con sus propiedades parseadas.
 */
export async function searchConcepts(query, limit = 10) {
  logger.info(`🔍 Notion: Buscando conceptos con "${query}"...`);

  await rateLimiter.acquire();

  const response = await withRetry(
    () =>
      notion.databases.query({
        database_id: config.notion.databaseId,
        filter: {
          property: 'Concepto',
          title: {
            contains: query,
          },
        },
        page_size: limit,
      }),
    { label: 'Notion searchConcepts', maxRetries: 3 }
  );

  const pages = response.results.map(parsePageProperties);
  logger.info(`Notion: Encontradas ${pages.length} páginas para "${query}"`);
  return pages;
}

/**
 * Lista todos los conceptos de la base de datos.
 *
 * @param {number} limit - Máximo de resultados (default: 50).
 * @returns {Promise<Array>} Lista de páginas con sus propiedades parseadas.
 */
export async function listAllConcepts(limit = 50) {
  logger.info('📋 Notion: Listando todos los conceptos...');

  await rateLimiter.acquire();

  const response = await withRetry(
    () =>
      notion.databases.query({
        database_id: config.notion.databaseId,
        page_size: limit,
        sorts: [{ property: 'Fecha', direction: 'descending' }],
      }),
    { label: 'Notion listAllConcepts', maxRetries: 3 }
  );

  const pages = response.results.map(parsePageProperties);
  logger.info(`Notion: Total listado: ${pages.length} conceptos`);
  return pages;
}

/**
 * Obtiene el contenido completo de una página (propiedades + body).
 *
 * @param {string} pageId - ID de la página en Notion.
 * @returns {Promise<Object>} Propiedades + contenido del body como texto.
 */
export async function getPageContent(pageId) {
  logger.info(`📖 Notion: Leyendo contenido de página ${pageId}...`);

  await rateLimiter.acquire();

  // Obtener propiedades de la página
  const page = await withRetry(
    () => notion.pages.retrieve({ page_id: pageId }),
    { label: 'Notion getPage', maxRetries: 3 }
  );

  await rateLimiter.acquire();

  // Obtener bloques del body
  const blocks = await withRetry(
    () =>
      notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      }),
    { label: 'Notion getBlocks', maxRetries: 3 }
  );

  const properties = parsePageProperties(page);
  const bodyText = blocksToText(blocks.results);

  logger.success(`Notion: Página leída (${bodyText.length} chars de contenido)`);

  return {
    id: page.id,
    ...properties,
    bodyContent: bodyText,
  };
}

// ─── Helpers internos ──────────────────────────────────────────────

/**
 * Extrae las propiedades de una página de Notion a un objeto plano.
 */
function parsePageProperties(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    name: props['Concepto']?.title?.[0]?.plain_text || '',
    category: props['Categoría']?.select?.name || '',
    summary: props['Resumen']?.rich_text?.[0]?.plain_text || '',
    source: props['Fuente']?.rich_text?.[0]?.plain_text || '',
    date: props['Fecha']?.date?.start || '',
    status: props['Estado']?.select?.name || '',
    tags: (props['Tags']?.multi_select || []).map((t) => t.name),
    mem0Id: props['Mem0 ID']?.rich_text?.[0]?.plain_text || '',
    relatedIds: (props['Relacionados']?.relation || []).map((r) => r.id),
  };
}

/**
 * Convierte bloques de Notion a texto plano legible.
 */
function blocksToText(blocks) {
  return blocks
    .map((block) => {
      const type = block.type;
      const content = block[type];

      if (!content) return '';

      // Extraer rich_text de cualquier tipo de bloque
      const richText = content.rich_text;
      if (richText && Array.isArray(richText)) {
        const text = richText.map((rt) => rt.plain_text).join('');
        switch (type) {
          case 'heading_2':
            return `\n## ${text}`;
          case 'heading_3':
            return `\n### ${text}`;
          case 'bulleted_list_item':
            return `- ${text}`;
          case 'numbered_list_item':
            return `1. ${text}`;
          case 'quote':
            return `> ${text}`;
          case 'code':
            return `\`\`\`\n${text}\n\`\`\``;
          case 'callout':
            return `💡 ${text}`;
          default:
            return text;
        }
      }

      if (type === 'divider') return '---';

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Construye el objeto de propiedades para la API de Notion.
 */
function buildProperties(data) {
  const props = {};

  if (data.name) {
    props['Concepto'] = {
      title: [{ text: { content: data.name } }],
    };
  }

  if (data.category) {
    props['Categoría'] = {
      select: { name: data.category },
    };
  }

  if (data.summary) {
    props['Resumen'] = {
      rich_text: [{ text: { content: data.summary.slice(0, 2000) } }],
    };
  }

  if (data.source) {
    props['Fuente'] = {
      rich_text: [{ text: { content: data.source } }],
    };
  }

  if (data.tags && data.tags.length > 0) {
    props['Tags'] = {
      multi_select: data.tags.map((tag) => ({ name: tag })),
    };
  }

  if (data.mem0Id) {
    props['Mem0 ID'] = {
      rich_text: [{ text: { content: data.mem0Id } }],
    };
  }

  // Fecha: siempre la fecha actual
  props['Fecha'] = {
    date: { start: new Date().toISOString().split('T')[0] },
  };

  // Estado: por defecto "🌱 Semilla" para conceptos nuevos
  if (!data.status) {
    props['Estado'] = {
      select: { name: '🌱 Semilla' },
    };
  } else {
    props['Estado'] = {
      select: { name: data.status },
    };
  }

  return props;
}

/**
 * Divide un array en chunks de tamaño máximo.
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

