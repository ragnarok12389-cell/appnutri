import fs from 'node:fs';

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[name]) process.env[name] = value;
  }
}

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'GEMINI_API_KEY',
];

const failures = [];

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value || value.includes('your-') || value.includes('example')) {
    failures.push(`${name}: ausente ou placeholder`);
  }
}

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL']) {
  const value = process.env[name]?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') failures.push(`${name}: deve usar HTTPS em produção`);
    } catch {
      failures.push(`${name}: URL inválida`);
    }
  }
}

if (failures.length > 0) {
  console.error('Ambiente de produção inválido:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Ambiente de produção válido. Nenhum valor secreto foi exibido.');
