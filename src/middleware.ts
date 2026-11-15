import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Create supabase server client
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    // Get user session
    const { data: { user } } = await supabase.auth.getUser()

    // Optional allowlist: set ADMIN_EMAILS (comma-separated) to restrict the
    // panel to specific accounts. Unset = any authenticated Supabase user.
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)

    const isAdmin =
        !!user && (adminEmails.length === 0 || adminEmails.includes((user.email || '').toLowerCase()))

    const pathname = request.nextUrl.pathname
    const isAuthPath =
        pathname.startsWith('/login') || pathname.startsWith('/api') || pathname.includes('.')

    // If not an allowed admin and asking for a protected page, send to login.
    if (!isAdmin && !isAuthPath) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        if (user) url.searchParams.set('denied', '1')
        return NextResponse.redirect(url)
    }

    // If an allowed admin and asking for the login page, redirect to home.
    if (isAdmin && pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
