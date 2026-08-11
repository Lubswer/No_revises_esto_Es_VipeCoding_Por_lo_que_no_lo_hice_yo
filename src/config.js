import dotenv from 'dotenv';
dotenv.config();

const requiredVars = [
  'GROQ_API_KEY',
  'MEM0_API_KEY',
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID',
];

// Validar que todas las variables requeridas existan
const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `\n❌ Variables de entorno faltantes: ${missing.join(', ')}\n` +
    `   Copia .env.example a .env y completa los valores.\n`
  );
  process.exit(1);
}

const config = {
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    temperature: parseFloat(process.env.GROQ_TEMPERATURE || '0.2'),
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS || '2000', 10),
  },
  mem0: {
    apiKey: process.env.MEM0_API_KEY,
  },
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID,
  },
  userId: process.env.USER_ID || 'usuario_principal',
  port: parseInt(process.env.PORT || '3000', 10),
};

export default config;
