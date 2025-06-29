# @seamless-auth/server

> A drop-in authentication API and route protection toolkit for Next.js powered by SeamlessAuth.

SeamlessAuth provides passwordless authentication, WebAuthn support, and Stripe-ready billing with minimal configuration. This server package handles **all authentication API routes and token validation** so you can focus on building your product.

---

## 🚀 Quick Start

### 1. Install the Package

```bash
npm install @seamless-auth/server
```

---

### 2. Create the Drop-In API Route

In your Next.js project:

```ts
// app/api/auth/route.ts

export {
  authApiHandler as GET,
  authApiHandler as POST,
  authApiHandler as DELETE,
  authApiHandler as PATCH,
} from "@seamless-auth/server";
```

👉 This exposes all SeamlessAuth API routes automatically:

- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/user`
- `/api/auth/registration/register`
- `/api/auth/otp/*`
- `/api/auth/webauthn/*`
- `/api/auth/user/update`
- `/api/auth/user/delete`

---

### 3. Wrap Your App with the Auth Provider

```tsx
// app/layout.tsx
import { AuthProvider } from "@seamless-auth/nextjs";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

---

### 4. Protect API Routes

```ts
// app/api/protected/route.ts
import { withAuth } from "@seamless-auth/server";

export const GET = withAuth(async (req, user) => {
  return Response.json({ message: "Hello, protected world!", user });
});
```

👉 Automatically verifies the token via JWKS and injects the user object.

---

### 5. Optional: Protect Pages with Middleware

```ts
// middleware.ts
import { getUserFromRequest } from "@seamless-auth/server";
import { NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/settings"];

export async function middleware(req) {
  if (protectedPaths.some((path) => req.nextUrl.pathname.startsWith(path))) {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }
  return NextResponse.next();
}
```

---

### 6. Environment Variables

Add this to your `.env.local`:

```env
SEAMLESS_AUTH_JWKS_URL=https://your-auth-server.com/.well-known/jwks.json
AUTH_SERVER_URL=https://your-auth-server.com
```

---

## ✅ Features

- 🔒 Fully server-side token validation using JWKS.
- 🔑 Built-in drop-in auth API routes.
- 📦 No consumer-side API route boilerplate.
- 🛡️ Secure cookie handling, ready for production.
- ⚡️ Fast, minimal setup — just install and go.
- 💻 Seamless Next.js integration.

---

## ✅ Provided API Routes

The following routes are automatically available:

### Authentication

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/user`
- `PATCH /api/auth/user/update`
- `DELETE /api/auth/user/delete`

### Registration

- `POST /api/auth/registration/register`

### OTP

- `POST /api/auth/otp/generate-phone-otp`
- `POST /api/auth/otp/generate-email-otp`
- `POST /api/auth/otp/verify-phone-otp`
- `POST /api/auth/otp/verify-email-otp`

### WebAuthn

- `POST /api/auth/webauthn/generate-authentication-options`
- `POST /api/auth/webauthn/verify-authentication`
- `POST /api/auth/webauthn/generate-registration-options`
- `POST /api/auth/webauthn/verify-registration`

---

## ✅ Provided Utilities

- `withAuth` — Protects API routes with token validation.
- `getUserFromRequest` — Reads cookies and verifies tokens in Next.js middleware or API routes.

---

## ✅ Coming Soon

- Built-in rate limiting for JWKS and auth endpoints.
- Extended multi-tenant support.
- Additional OAuth providers.

---

For the full frontend setup, see the `@seamless-auth/nextjs` package.
