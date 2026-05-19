from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        enable_hsts: bool = True,
        hsts_max_age: int = 31536000,
        hsts_include_subdomains: bool = True,
        hsts_preload: bool = False,
    ):
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.hsts_max_age = max(0, int(hsts_max_age or 0))
        self.hsts_include_subdomains = bool(hsts_include_subdomains)
        self.hsts_preload = bool(hsts_preload)

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; "
            "form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline';"
        )
        if self.enable_hsts:
            directives = [f"max-age={self.hsts_max_age}"]
            if self.hsts_include_subdomains:
                directives.append("includeSubDomains")
            if self.hsts_preload:
                directives.append("preload")
            response.headers["Strict-Transport-Security"] = "; ".join(directives)
        return response
