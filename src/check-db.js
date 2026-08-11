import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function checkDatabase() {
  try {
    const db = await notion.databases.retrieve({
      database_id: process.env.NOTION_DATABASE_ID,
    });

    console.log('\n✅ Base de datos encontrada:', db.title?.[0]?.plain_text || '(sin título)');
    console.log('\n📋 Propiedades actuales:\n');

    for (const [name, prop] of Object.entries(db.properties)) {
      console.log(`  - "${name}" → tipo: ${prop.type}`);
    }

    console.log('\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.code === 'object_not_found') {
      console.error('   ¿Compartiste la base de datos con la integración de Notion?');
    }
  }
}

checkDatabase();
