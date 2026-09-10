import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/', '/login', '/register', '/unauthorized', '/privacy', '/terms'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, profile } = await updateSession(request);

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

  if (pathname.startsWith('/invite') || pathname.startsWith('/professional-invite')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (user && profile) {
    if ((profile.status === 'pending_verification' || !profile.is_active) && !isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'pending_verification');
      return NextResponse.redirect(loginUrl);
    }

    const userRole = profile.role_id;

    if (pathname.startsWith('/admin') && userRole !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    if (
      pathname.startsWith('/professional') &&
      userRole !== 'nutritionist' &&
      userRole !== 'influencer'
    ) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    if (pathname.startsWith('/patient') && userRole !== 'patient') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
