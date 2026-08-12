/**
 * Script para configurar las propiedades del esquema en la base de datos de Notion.
 * Solo necesitas ejecutarlo UNA VEZ.
 *
 * Uso: node src/setup-db.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

async function setupDatabase() {
  console.log('\n🔧 Configurando base de datos de Notion...\n');

  try {
    // Primero renombrar "Nombre" a "Concepto" y agregar las demás propiedades
    await notion.databases.update({
      database_id: databaseId,
      title: [{ text: { content: '🧠 Memoria de Aprendizaje' } }],
      properties: {
        'Categoría': {
          select: {
            options: [
              { name: 'Programación', color: 'blue' },
              { name: 'Arquitectura', color: 'purple' },
              { name: 'DevOps', color: 'orange' },
              { name: 'IA/ML', color: 'pink' },
              { name: 'Base de Datos', color: 'green' },
              { name: 'Frontend', color: 'yellow' },
              { name: 'Backend', color: 'red' },
              { name: 'Redes', color: 'gray' },
              { name: 'Seguridad', color: 'brown' },
              { name: 'Diseño', color: 'default' },
              { name: 'Metodología', color: 'blue' },
              { name: 'Concepto General', color: 'default' },
            ],
          },
        },
        'Resumen': {
          rich_text: {},
        },
        'Fuente': {
          rich_text: {},
        },
        'Fecha': {
          date: {},
        },
        'Estado': {
          select: {
            options: [
              { name: '🌱 Semilla', color: 'green' },
              { name: '🌿 Creciendo', color: 'yellow' },
              { name: '🌳 Consolidado', color: 'blue' },
            ],
          },
        },
        'Tags': {
          multi_select: {
            options: [],
          },
        },
        'Mem0 ID': {
          rich_text: {},
        },
        'Dudas Frecuentes': {
          rich_text: {},
        },
        'Dificultad Percibida': {
          select: {
            options: [
              { name: '🟢 Fácil', color: 'green' },
              { name: '🟡 Moderada', color: 'yellow' },
              { name: '🔴 Compleja', color: 'red' },
              { name: '🧩 Requirió Repaso', color: 'purple' },
            ],
          },
        },
        'Nivel de Dominio': {
          select: {
            options: [
              { name: '🌱 Aprendiendo', color: 'yellow' },
              { name: '🌿 Practicando', color: 'blue' },
              { name: '🌳 Dominado', color: 'green' },
            ],
          },
        },
      },
    });

    console.log('✅ Propiedades creadas exitosamente:\n');
    console.log('  📌 Concepto (title) — renombrado desde "Nombre"');
    console.log('  📂 Categoría (select) — con 12 opciones predefinidas');
    console.log('  📝 Resumen (rich_text)');
    console.log('  📎 Fuente (rich_text)');
    console.log('  📅 Fecha (date)');
    console.log('  🌱 Estado (select) — Semilla / Creciendo / Consolidado');
    console.log('  🏷️  Tags (multi_select)');
    console.log('  🔗 Mem0 ID (rich_text)');

    // Agregar la propiedad Relation (self-relation)
    // Esto requiere una llamada separada
    try {
      await notion.databases.update({
        database_id: databaseId,
        properties: {
          'Relacionados': {
            relation: {
              database_id: databaseId, // Self-relation
              type: 'dual_property',
              dual_property: {},
            },
          },
        },
      });
      console.log('  🔗 Relacionados (relation) — self-relation para conectar conceptos');
    } catch (relErr) {
      console.log(`  ⚠️  Relacionados: no se pudo crear automáticamente (${relErr.message})`);
      console.log('      → Créala manualmente en Notion: Añade propiedad "Relation" que apunte a la misma DB');
    }

    console.log('\n✅ ¡Base de datos lista! Ya puedes ejecutar el pipeline.\n');
  } catch (err) {
    console.error('\n❌ Error configurando la base de datos:', err.message);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
  }
}

setupDatabase();
