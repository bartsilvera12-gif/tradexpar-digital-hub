/**
 * Misma comprobación que en index.js: `x-api-key` = API_PUBLIC_KEY | API_KEY.
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
export function createApiKeyMiddleware() {
  const API_KEY = process.env.API_PUBLIC_KEY || process.env.API_KEY || "";
  return function requireApiKey(req, res, next) {
    const key = req.headers["x-api-key"];
    if (!API_KEY || key !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
}
