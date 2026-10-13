/**
 * Middleware ghi log yêu cầu HTTP tối giản và bảo mật
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${method} ${originalUrl} ${color}${statusCode}${reset} - ${duration}ms`
    );
  });

  next();
}

export default requestLogger;
