/**
 * Parsea un string de markdown inline y devuelve un array de objetos rich_text de Notion
 * soportando **negrita**, *cursiva*, y `código inline`.
 *
 * @param {string} text - Texto con markdown inline.
 * @returns {Array} Array de rich_text objects para la API de Notion.
 */
export function parseInlineMarkdown(text) {
  if (!text) return [];

  const chunks = [];
  // Regex para capturar **bold**, *italic*, y `code`
  const regex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Texto plano previo a la coincidencia
    if (match.index > lastIndex) {
      chunks.push({
        type: 'text',
        text: { content: text.slice(lastIndex, match.index) },
        annotations: { bold: false, italic: false, code: false },
      });
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('**')) {
      // Negrita
      chunks.push({
        type: 'text',
        text: { content: match[2] },
        annotations: { bold: true, italic: false, code: false },
      });
    } else if (fullMatch.startsWith('`')) {
      // Código inline
      chunks.push({
        type: 'text',
        text: { content: match[4] },
        annotations: { bold: false, italic: false, code: true },
      });
    } else if (fullMatch.startsWith('*')) {
      // Cursiva
      chunks.push({
        type: 'text',
        text: { content: match[3] },
        annotations: { bold: false, italic: true, code: false },
      });
    }

    lastIndex = regex.lastIndex;
  }

  // Texto restante
  if (lastIndex < text.length) {
    chunks.push({
      type: 'text',
      text: { content: text.slice(lastIndex) },
      annotations: { bold: false, italic: false, code: false },
    });
  }

  return chunks.length > 0 ? chunks : [{ type: 'text', text: { content: text } }];
}

/**
 * Crea un bloque de texto enriquecido de Notion.
 */
function richText(text) {
  return parseInlineMarkdown(text);
}

/**
 * Crea un bloque de párrafo.
 */
export function paragraph(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: parseInlineMarkdown(text),
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
      rich_text: parseInlineMarkdown(text),
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
      rich_text: parseInlineMarkdown(text),
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
      rich_text: parseInlineMarkdown(text),
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
      rich_text: [{ type: 'text', text: { content: code } }],
      language: language || 'javascript',
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
      rich_text: parseInlineMarkdown(text),
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
      rich_text: parseInlineMarkdown(text),
    },
  };
}

/**
 * Crea un bloque de Tabla de Contenidos (Índice nativo navegable de Notion).
 */
export function tableOfContents() {
  return {
    object: 'block',
    type: 'table_of_contents',
    table_of_contents: {
      color: 'gray_background',
    },
  };
}

/**
 * Crea un bloque desplegable (Toggle block).
 */
export function toggle(title, children = []) {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: parseInlineMarkdown(title),
      children,
    },
  };
}

/**
 * Crea un bloque de Tabla nativa de Notion.
 */
export function tableBlock(rows) {
  if (!rows || rows.length === 0) return null;
  const width = rows[0].length;

  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((row) => ({
        type: 'table_row',
        table_row: {
          cells: row.map((cell) => parseInlineMarkdown(cell)),
        },
      })),
    },
  };
}

/**
 * Convierte texto con formato simplificado a un array de bloques de Notion.
 */
export function markdownToBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];

  // 1. Insertar siempre la Tabla de Contenidos / Índice navegable arriba del todo
  blocks.push(callout('Índice Navegable de la Nota', '📍'));
  blocks.push(tableOfContents());
  blocks.push(divider());

  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLanguage = 'plain text';
  let toggleSummary = '▶️ 💻 Ver Ejemplo Práctico de Código';

  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detección de tablas markdown (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Ignorar línea divisoria markdown (| --- | --- |)
      if (trimmed.includes('---')) continue;

      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      if (cells.length > 0) {
        tableRows.push(cells);
        inTable = true;
      }
      continue;
    } else if (inTable) {
      // Fin de la tabla
      if (tableRows.length > 0) {
        const tbl = tableBlock(tableRows);
        if (tbl) blocks.push(tbl);
      }
      tableRows = [];
      inTable = false;
    }

    // Detección de etiquetas <details> y <summary> para Toggles
    if (trimmed.startsWith('<summary>')) {
      toggleSummary = trimmed.replace(/<\/?summary>/g, '').trim();
      continue;
    }
    if (trimmed === '</details>' || trimmed === '<details>') {
      continue;
    }

    // Manejo de bloques de código multilínea (dentro de un Toggle)
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // Cerrar bloque de código envuelto en un Toggle desplegable
        const codeBlk = codeBlock(codeBuffer.join('\n'), codeLanguage);
        blocks.push(toggle(toggleSummary, [codeBlk]));
        codeBuffer = [];
        inCodeBlock = false;
        codeLanguage = 'plain text';
        toggleSummary = '▶️ 💻 Ver Ejemplo Práctico de Código';
      } else {
        // Abrir bloque de código
        inCodeBlock = true;
        const lang = trimmed.slice(3).trim();
        if (lang) codeLanguage = lang;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Líneas vacías → omitir (Notion maneja el espaciado)
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

    // Callout (empieza con emoji seguido de texto o negritas)
    const emojiMatch = trimmed.match(/^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])\s+(.*)/u);
    if (emojiMatch && (trimmed.startsWith('💡') || trimmed.startsWith('⚠️') || trimmed.startsWith('🚀') || trimmed.startsWith('📌') || trimmed.startsWith('💻') || trimmed.startsWith('🔗'))) {
      const emoji = emojiMatch[1];
      const textContent = emojiMatch[2].replace(/^\*\*(.*)\*\*$/, '$1').trim();
      blocks.push(callout(textContent, emoji));
      continue;
    }

    // Cita / Blockquote (si empieza con >)
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2).trim();
      // Si la cita empieza con emoji, convertir a Callout visual
      if (quoteText.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u)) {
        const emoji = quoteText.slice(0, 2).trim();
        blocks.push(callout(quoteText.slice(2).trim(), emoji || '💡'));
      } else {
        blocks.push(quote(quoteText));
      }
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
