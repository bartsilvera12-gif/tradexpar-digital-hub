/**
 * `x-api-key` = API_PUBLIC_KEY | API_KEY, resuelta en cada request.
 *
 * No se puede capturar la env al crear el middleware: los `import` de ESM se evalúan ANTES del
 * cuerpo del módulo que importa, así que un `createApiKeyMiddleware()` a nivel de módulo en
 * `integrations/*//*routes.js` corre antes del `dotenv.config()` de `index.js` y captura "" →
 * `!API_KEY` siempre true → 401 en todas esas rutas aunque la clave enviada sea correcta.
 * @returns {string}
 */
export function resolveApiKey() {
  return String(process.env.API_PUBLIC_KEY || process.env.API_KEY || "").trim();
}

/**
 * Misma comprobación que en index.js: `x-api-key` = API_PUBLIC_KEY | API_KEY.
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
export function createApiKeyMiddleware() {
  return function requireApiKey(req, res, next) {
    const API_KEY = resolveApiKey();
    const key = req.headers["x-api-key"];
    if (!API_KEY || key !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
}
