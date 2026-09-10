import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET as healthcheck } from '@/app/api/health/route';

describe('Production Gate', () => {
  it('publica um healthcheck mínimo sem cache ou segredos', async () => {
    const response = healthcheck();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload).toMatchObject({ status: 'ok', service: 'appnutri-web' });
    expect(JSON.stringify(payload)).not.toMatch(/key|secret|token/i);
  });

  it('aplica cabeçalhos defensivos globalmente e oculta a tecnologia', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../next.config.ts'), 'utf8');
    expect(config).toContain('poweredByHeader: false');
    expect(config).toContain('X-Content-Type-Options');
    expect(config).toContain('X-Frame-Options');
    expect(config).toContain('Permissions-Policy');
    expect(config).toContain('Cross-Origin-Opener-Policy');
  });

  it('mantém páginas legais públicas e valida o ambiente sem imprimir valores', () => {
    const proxy = fs.readFileSync(path.resolve(__dirname, '../src/proxy.ts'), 'utf8');
    const envCheck = fs.readFileSync(path.resolve(__dirname, '../scripts/check-production-env.mjs'), 'utf8');
    const hostedAudit = fs.readFileSync(path.resolve(__dirname, '../scripts/audit-hosted-supabase.mjs'), 'utf8');
    expect(proxy).toContain("'/privacy'");
    expect(proxy).toContain("'/terms'");
    expect(envCheck).toContain('deve usar HTTPS em produção');
    expect(envCheck).not.toContain('console.log(process.env');
    expect(hostedAudit).toContain("getBucket('patient-media')");
    expect(hostedAudit).toContain('anon-rpc:');
  });

  it('não devolve detalhes internos nas falhas inesperadas do Companion', () => {
    const chat = fs.readFileSync(path.resolve(__dirname, '../src/app/api/ai/companion/chat/route.ts'), 'utf8');
    const confirmation = fs.readFileSync(path.resolve(__dirname, '../src/app/api/ai/companion/confirm-action/route.ts'), 'utf8');
    expect(chat).not.toContain('error: errorMsg');
    expect(confirmation).not.toContain('error: errorMsg');
    expect(chat).toContain('Não foi possível concluir a solicitação agora.');
    expect(confirmation).toContain('Não foi possível processar a confirmação agora.');
  });

  it('limita análises visuais para proteger custo e disponibilidade', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/progress/meal-analysis/route.ts'), 'utf8');
    expect(route).toContain("status: 429");
    expect(route).toContain("'Retry-After': '3600'");
    expect(route).toContain('recentAnalysisCount');
  });
});
