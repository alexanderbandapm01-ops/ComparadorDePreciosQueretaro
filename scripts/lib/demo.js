'use strict';
/** Identifica y borra los datos de demostración (fuente "DEMO ..."). */
const PREFIJO_FUENTE = 'DEMO';
const PREFIJO_CALLE = '[DEMO]';

async function borrarDemo(conn) {
  const [fuentes] = await conn.query('SELECT id_fuente FROM fuente_datos WHERE nombre_archivo LIKE ?', [PREFIJO_FUENTE + '%']);
  let borrados = 0;
  if (fuentes.length) {
    const ids = fuentes.map((f) => f.id_fuente);
    const [r] = await conn.query('DELETE FROM registro_precio WHERE id_fuente IN (?)', [ids]);
    borrados = r.affectedRows;
    await conn.query('DELETE FROM fuente_datos WHERE id_fuente IN (?)', [ids]);
  }
  const [suc] = await conn.query('SELECT id_sucursal FROM sucursal WHERE calle LIKE ?', [PREFIJO_CALLE + '%']);
  if (suc.length) {
    const ids = suc.map((s) => s.id_sucursal);
    await conn.query('DELETE FROM recomendacion WHERE id_sucursal IN (?)', [ids]);
    await conn.query('DELETE FROM registro_precio WHERE id_sucursal IN (?)', [ids]);
    await conn.query('DELETE FROM sucursal WHERE id_sucursal IN (?)', [ids]);
  }
  return borrados;
}

module.exports = { borrarDemo, PREFIJO_FUENTE, PREFIJO_CALLE };
