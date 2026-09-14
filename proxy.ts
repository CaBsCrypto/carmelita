import { NextRequest, NextResponse } from "next/server";
import { maintenanceBypass, maintenanceEnabled, maintenancePublicRead } from "./app/maintenance";

export function proxy(request: NextRequest) {
  if (!maintenanceEnabled() || maintenancePublicRead(request.nextUrl.pathname, request.method)) return NextResponse.next();
  if (maintenanceBypass(request.headers.get("x-carmelita-maintenance-access"))) {
    const headers = new Headers(request.headers);
    headers.delete("x-carmelita-maintenance-access");
    return NextResponse.next({ request: { headers } });
  }
  const headers = { "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "maintenance_in_progress" }, { status: 503, headers });
  }
  return new NextResponse('<!doctype html><html lang="es"><meta charset="utf-8"><title>Carmelita — mantenimiento</title><main><h1>Estamos actualizando Carmelita</h1><p>Vuelve a intentarlo en unos minutos.</p></main></html>', {
    status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config = { matcher: "/:path*" };
