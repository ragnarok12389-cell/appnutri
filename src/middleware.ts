import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Rotas públicas que não requerem autenticação
const PUBLIC_PATHS = ['/', '/login', '/register', '/unauthorized'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Atualiza e refresca a sessão via cookies Supabase SSR
  const { response, user, profile } = await updateSession(request);

  // 2. Permite acesso a recursos estáticos e assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return response;
  }

  const isPublicPath =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/professional-invite');

  // Aplica headers de proteção contra vazamento de token nas rotas de convite
  if (pathname.startsWith('/invite') || pathname.startsWith('/professional-invite')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  // 3. Usuário NÃO autenticado tentando acessar rota privada -> Redireciona para /login
  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Usuário JÁ autenticado tentando acessar telas de login/registro -> Redireciona para /dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 5. Proteção de rotas baseada em Roles e Status
  if (user && profile) {
    // Bloqueia acesso a áreas restritas se a verificação de e-mail estiver pendente ou conta inativa
    if ((profile.status === 'pending_verification' || !profile.is_active) && !isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'pending_verification');
      return NextResponse.redirect(loginUrl);
    }

    const userRole = profile.role_id;

    // Rota /admin: Exclusiva para 'admin'
    if (pathname.startsWith('/admin') && userRole !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Rota /professional: Exclusiva para 'nutritionist' e 'influencer'
    if (
      pathname.startsWith('/professional') &&
      userRole !== 'nutritionist' &&
      userRole !== 'influencer'
    ) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Rota /patient: Exclusiva para 'patient'
    if (pathname.startsWith('/patient') && userRole !== 'patient') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware a todas as rotas exceto arquivos estáticos
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
