/**
 * Utilidades para convertir texto/markdown simplificado
 * a bloques compatibles con la API de Notion.
 *
 * Notion usa bloques tipados (paragraph, heading_2, bulleted_list_item, code, etc.)
 * en lugar de markdown plano.
 */

/**
 * Crea un bloque de texto enriquecido de Notion (rich_text).
 * @param {string} text - Texto plano.
 * @param {Object} annotations - Estilos opcionales.
 * @returns {Object} Rich text object de Notion.
 */
function richText(text, annotations = {}) {
  return {
    type: 'text',
    text: { content: text },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...annotations,
    },
  };
}

/**
 * Crea un bloque de párrafo.
 */
export function paragraph(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [richText(text)],
    },
  };
}

/**
 * Crea un bloque de encabezado nivel 2.
 */
export function heading2(text) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [richText(text)],
    },
  };
}

/**
 * Crea un bloque de encabezado nivel 3.
 */
export function heading3(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [richText(text)],
    },
  };
}

/**
 * Crea un bloque de lista con viñetas.
 */
export function bulletItem(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [richText(text)],
    },
  };
}

/**
 * Crea un bloque de código.
 */
export function codeBlock(code, language = 'javascript') {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [richText(code)],
      language,
    },
  };
}

/**
 * Crea un bloque de callout (destacado).
 */
export function callout(text, emoji = '💡') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [richText(text)],
      icon: { type: 'emoji', emoji },
    },
  };
}

/**
 * Crea un bloque divisor.
 */
export function divider() {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

/**
 * Crea un bloque de cita.
 */
export function quote(text) {
  return {
    object: 'block',
    type: 'quote',
    quote: {
      rich_text: [richText(text)],
    },
  };
}

/**
 * Convierte texto con formato simplificado a un array de bloques de Notion.
 *
 * Formato soportado:
 * - `## Título`       → heading_2
 * - `### Subtítulo`   → heading_3
 * - `- item`          → bulleted_list_item
 * - `> cita`          → quote
 * - ``` código ```    → code
 * - `💡 callout`      → callout
 * - Texto normal      → paragraph
 *
 * @param {string} markdown - Texto con formato simplificado.
 * @returns {Object[]} Array de bloques de Notion.
 */
export function markdownToBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLanguage = 'plain text';

  for (const line of lines) {
    // Manejo de bloques de código multilínea
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // Cerrar bloque de código
        blocks.push(codeBlock(codeBuffer.join('\n'), codeLanguage));
        codeBuffer = [];
        inCodeBlock = false;
        codeLanguage = 'plain text';
      } else {
        // Abrir bloque de código
        inCodeBlock = true;
        const lang = line.slice(3).trim();
        if (lang) codeLanguage = lang;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Líneas vacías → omitir (Notion maneja el espaciado)
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heading 2
    if (trimmed.startsWith('## ')) {
      blocks.push(heading2(trimmed.slice(3)));
      continue;
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      blocks.push(heading3(trimmed.slice(4)));
      continue;
    }

    // Lista con viñetas
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(bulletItem(trimmed.slice(2)));
      continue;
    }

    // Cita
    if (trimmed.startsWith('> ')) {
      blocks.push(quote(trimmed.slice(2)));
      continue;
    }

    // Callout (empieza con emoji seguido de texto)
    if (trimmed.startsWith('💡 ') || trimmed.startsWith('⚠️ ') || trimmed.startsWith('📝 ')) {
      blocks.push(callout(trimmed.slice(2).trim(), trimmed.slice(0, 2)));
      continue;
    }

    // Divisor
    if (trimmed === '---' || trimmed === '***') {
      blocks.push(divider());
      continue;
    }

    // Párrafo por defecto
    blocks.push(paragraph(trimmed));
  }

  // Si quedó un bloque de código sin cerrar, cerrarlo
  if (inCodeBlock && codeBuffer.length > 0) {
    blocks.push(codeBlock(codeBuffer.join('\n'), codeLanguage));
  }

  return blocks;
}
