import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadLocalEnvironment() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[name]) process.env[name] = value;
  }
}

loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Credenciais do Supabase ausentes. Nenhum valor foi exibido.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const migrationDir = path.resolve('supabase/migrations');
const tableNames = new Set();
for (const file of fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))) {
  const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
  for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? public\.([a-z0-9_]+)/gi)) {
    tableNames.add(match[1]);
  }
}

const failures = [];
for (const table of [...tableNames].sort()) {
  const { error } = await admin.from(table).select('*', { head: true, count: 'exact' });
  if (error) failures.push(`schema:${table}`);
}

const sensitiveTables = [
  'profiles', 'patients', 'patient_nutrition_profiles', 'patient_nutrition_sensitive',
  'diet_plans', 'workout_programs', 'workout_execution_logs', 'progress_checkins',
  'patient_progress_photos', 'meal_photo_analyses', 'ai_conversations', 'ai_messages',
  'audit_logs', 'user_entitlements',
];

for (const table of sensitiveTables) {
  const { data, error } = await anon.from(table).select('*').limit(1);
  if (!error && (data?.length || 0) > 0) failures.push(`anon-readable:${table}`);
}

for (const rpc of ['persist_diet_plan_from_service', 'persist_workout_program_from_service']) {
  const argument = rpc.includes('diet') ? { p_plan: {}, p_auto_approve: false } : { p_program: {}, p_auto_approve: false };
  const { error } = await anon.rpc(rpc, argument);
  if (!error) failures.push(`anon-rpc:${rpc}`);
}

const { data: bucket, error: bucketError } = await admin.storage.getBucket('patient-media');
if (bucketError || !bucket) failures.push('storage:patient-media-missing');
if (bucket?.public) failures.push('storage:patient-media-public');

if (failures.length > 0) {
  console.error(`Auditoria hospedada falhou em ${failures.length} verificação(ões):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Supabase hospedado aprovado: ${tableNames.size} tabelas presentes, RLS anônima bloqueada, RPCs privilegiados negados e bucket privado.`);
