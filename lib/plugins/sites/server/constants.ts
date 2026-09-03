export const SITES_PLUGIN_ID = 'sites';

export const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const RESERVED_SITE_NAMES = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'chatpro',
  'dashboard',
  'docs',
  'mail',
  'plugins',
  's',
  'sites',
  'static',
  'support',
  'www',
]);

export const SITE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SITE_MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
export const SITE_MAX_FILES = 1200;
export const SITE_MAX_PATH_LENGTH = 800;

export const TEXT_EXTENSIONS = new Set([
  'css',
  'csv',
  'htm',
  'html',
  'js',
  'json',
  'jsx',
  'md',
  'mjs',
  'svg',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

export const DEFAULT_INDEX_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mi sitio</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 4rem; }
      main { max-width: 48rem; margin: 0 auto; }
    </style>
  </head>
  <body>
    <main>
      <h1>Tu sitio está publicado</h1>
      <p>Editá este archivo y guardá los cambios para actualizarlo.</p>
    </main>
  </body>
</html>
`;
