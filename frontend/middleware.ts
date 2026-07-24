import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes: skip login page
  if (pathname.startsWith('/admin') && pathname === '/admin/login') {
    return NextResponse.next();
  }

  // Member routes: skip login/register/verify pages
  if (
    pathname.startsWith('/member') &&
    (pathname === '/member/login' || pathname === '/member/register' || pathname === '/member/verify')
  ) {
    return NextResponse.next();
  }

  // Portal routes: skip login page
  if (pathname.startsWith('/portal') && pathname === '/portal/login') {
    return NextResponse.next();
  }

  // Admin routes require admin_token
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Member routes require member_token
  if (pathname.startsWith('/member')) {
    const token = request.cookies.get('member_token')?.value;
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Portal routes require portal_token
  if (pathname.startsWith('/portal')) {
    const token = request.cookies.get('portal_token')?.value;
    if (!token) {
      const loginUrl = new URL('/portal/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/member/:path*', '/portal/:path*'],
};
