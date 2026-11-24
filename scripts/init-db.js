'use strict';
/**
 * Crea la base de datos comparador_precios_sostenible desde database/schema.sql
 * (equivale a ejecutar el script en Workbench). No inserta datos: después se
 * cargan los CSV limpios con 02_cargar.py.
 *
 *   npm run db:init            → crea la base (se niega si ya tiene precios)
 *   npm run db:init -- --force → la borra y la vuelve a crear
 */
const fs = require('fs');
const path = require('path');
const { conectar, config } = require('../src/db');

(async () => {
  const force = process.argv.includes('--force');
  const conn = await conectar({ sinBase: true, multipleStatements: true });
  try {
    const [bases] = await conn.query('SHOW DATABASES LIKE ?', [config.database]);
    if (bases.length && !force) {
      const [t] = await conn.query(
        'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [config.database, 'registro_precio']
      );
      if (t[0].n) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) n FROM \`${config.database}\`.registro_precio`);
        if (n > 0) {
          console.error(`✋ La base "${config.database}" ya tiene ${n} precios. Para borrarla y recrearla usa: npm run db:init -- --force`);
          process.exit(1);
        }
      }
    }
    let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    sql = sql.replace(/comparador_precios_sostenible/g, config.database);
    await conn.query(sql);
    console.log(`✅ Base de datos "${config.database}" creada (vacía) en ${config.host}:${config.port}.`);
    console.log('   Siguiente paso: python 01_limpiar.py  y  python 02_cargar.py  (ver README)');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('❌ No se pudo crear la base de datos:', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('   Revisa DB_USER / DB_PASSWORD en el archivo .env');
  if (e.code === 'ECONNREFUSED') console.error('   ¿Está encendido MySQL en el puerto ' + config.port + '?');
  process.exit(1);
});
