// Only used by Vite's development preview. Production keeps its fixed APP_ORIGIN.
export const DEV_API_ORIGIN = 'http://localhost:5173';
export function isQuickTunnel(host) {
  try { return new URL(`http://${host}`).hostname.endsWith('.trycloudflare.com'); } catch { return false; }
}
export function previewOriginAllowed(host, origin) {
  if (typeof host !== 'string' || typeof origin !== 'string') return false;
  try {
    const request = new URL(`http://${host}`);
    const source = new URL(origin);
    return source.origin === origin && source.host === request.host &&
      (isQuickTunnel(host) ? source.protocol === 'https:' : ['http:', 'https:'].includes(source.protocol));
  } catch { return false; }
}
export function previewOriginGuard(req, res, next) {
  if (req.url?.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method ?? '') && !previewOriginAllowed(req.headers.host, req.headers.origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: '请求来源不匹配，请从当前预览地址打开应用' }));
    return;
  }
  next();
}
