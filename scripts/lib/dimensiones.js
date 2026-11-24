'use strict';
/**
 * Inserta (o reutiliza) registros de catálogos con caché en memoria.
 * Lo usan tanto el importador de QQP como el generador de datos demo.
 */
const { normalizar, parsePresentacion, clasificar, UNIDADES, kgProducto } = require('../../src/canasta');
const { MUNICIPIOS_QRO, TRANSPORTES } = require('../../src/geo');

const cortar = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

class Dimensiones {
  constructor(conn) {
    this.conn = conn;
    this.cache = new Map();
  }

  async _id(tipo, clave, crear) {
    const k = tipo + '|' + clave;
    if (this.cache.has(k)) return this.cache.get(k);
    const id = await crear();
    this.cache.set(k, id);
    return id;
  }

  // INSERT ... ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id) devuelve el id existente o el nuevo
  async _upsert(sql, params) {
    const [r] = await this.conn.execute(sql, params);
    return r.insertId;
  }

  estado(nombre) {
    const n = cortar(nombre, 100);
    return this._id('estado', normalizar(n), () =>
      this._upsert(
        'INSERT INTO estado (nombre, region) VALUES (?, ?) ON DUPLICATE KEY UPDATE id_estado = LAST_INSERT_ID(id_estado)',
        [n, normalizar(n) === 'QUERETARO' ? 'Bajío' : null]
      )
    );
  }

  async municipio(idEstado, nombre) {
    // Usa el nombre "bonito" (con acentos) si coincide con un municipio conocido
    const conocido = MUNICIPIOS_QRO.find((m) => normalizar(m.nombre) === normalizar(nombre));
    const n = cortar(conocido ? conocido.nombre : nombre, 100) || 'Sin municipio';
    return this._id('mun', idEstado + '|' + normalizar(n), () =>
      this._upsert(
        'INSERT INTO municipio (id_estado, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE id_municipio = LAST_INSERT_ID(id_municipio)',
        [idEstado, n]
      )
    );
  }

  _simple(tabla, col, nombre, largo, porDefecto) {
    const n = cortar(nombre, largo) || porDefecto;
    return this._id(tabla, normalizar(n), () =>
      this._upsert(`INSERT INTO ${tabla} (nombre) VALUES (?) ON DUPLICATE KEY UPDATE ${col} = LAST_INSERT_ID(${col})`, [n])
    );
  }
  catalogo(n) { return this._simple('catalogo', 'id_catalogo', n, 80, 'SIN CATALOGO'); }
  categoria(n) { return this._simple('categoria', 'id_categoria', n, 150, 'SIN CATEGORIA'); }
  marca(n) { return this._simple('marca', 'id_marca', n, 120, 'SIN MARCA'); }
  giro(n) { return this._simple('giro', 'id_giro', n, 120, 'SIN GIRO'); }
  cadena(n) { return this._simple('cadena_comercial', 'id_cadena', n, 120, 'SIN CADENA'); }

  unidad(abrev) {
    const u = UNIDADES[abrev] || UNIDADES['N/A'];
    return this._id('unidad', u.abreviatura, () =>
      this._upsert(
        'INSERT INTO unidad_medida (nombre, abreviatura, tipo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id_unidad = LAST_INSERT_ID(id_unidad)',
        [u.nombre, u.abreviatura, u.tipo]
      )
    );
  }

  async producto(idCategoria, idMarca, nombre) {
    const n = cortar(nombre, 200);
    return this._id('prod', `${idCategoria}|${idMarca}|${normalizar(n)}`, () =>
      this._upsert(
        'INSERT INTO producto (id_categoria, id_marca, nombre) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id_producto = LAST_INSERT_ID(id_producto)',
        [idCategoria, idMarca, n]
      )
    );
  }

  async presentacion(idProducto, textoPresentacion, idCatalogo) {
    const p = parsePresentacion(textoPresentacion);
    const idUnidad = await this.unidad(p.unidad);
    const id = await this._id('pres', `${idProducto}|${normalizar(p.descripcion_original)}`, () =>
      this._upsert(
        `INSERT INTO presentacion (id_producto, id_unidad, cantidad, envase, variante, descripcion_original)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id_presentacion = LAST_INSERT_ID(id_presentacion)`,
        [idProducto, idUnidad, p.cantidad, p.envase, p.variante, p.descripcion_original]
      )
    );
    if (idCatalogo) {
      await this._id('pc', `${id}|${idCatalogo}`, async () => {
        await this.conn.execute('INSERT IGNORE INTO presentacion_catalogo (id_presentacion, id_catalogo) VALUES (?, ?)', [id, idCatalogo]);
        return true;
      });
    }
    return id;
  }

  async sucursal({ idCadena, idMunicipio, idGiro, nombre, calle, colonia, cp, lat, lon }) {
    const v = [idCadena, cortar(nombre, 200) || 'SIN NOMBRE', cortar(calle, 300) || 'SIN CALLE', cortar(colonia, 150) || 'SIN COLONIA', (String(cp || '').match(/\d{5}/) || ['00000'])[0]];
    return this._id('suc', v.join('|'), () =>
      this._upsert(
        `INSERT INTO sucursal (id_cadena, id_municipio, id_giro, nombre_comercial, calle, colonia, codigo_postal, ubicacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326, 'axis-order=long-lat'))
         ON DUPLICATE KEY UPDATE id_sucursal = LAST_INSERT_ID(id_sucursal)`,
        [v[0], idMunicipio, idGiro, v[1], v[2], v[3], v[4], `POINT(${Number(lon)} ${Number(lat)})`]
      )
    );
  }

  async fuente(nombreArchivo, periodo) {
    const [r] = await this.conn.execute('INSERT INTO fuente_datos (nombre_archivo, periodo) VALUES (?, ?)', [
      cortar(nombreArchivo, 120),
      cortar(periodo, 30) || null,
    ]);
    return r.insertId;
  }
}

/** Inserta precios en lotes. Si ya existía el mismo registro, actualiza el precio. */
async function insertarPrecios(conn, filas) {
  for (let i = 0; i < filas.length; i += 1000) {
    const lote = filas.slice(i, i + 1000);
    await conn.query(
      `INSERT INTO registro_precio (id_presentacion, id_sucursal, id_fuente, fecha_registro, precio) VALUES ?
       ON DUPLICATE KEY UPDATE precio = VALUES(precio)`,
      [lote]
    );
  }
}

/** Asigna factor de emisión a cada producto de la canasta que aún no tenga uno. */
async function asignarFactores(conn) {
  const [productos] = await conn.query(
    `SELECT p.id_producto, p.nombre FROM producto p
     LEFT JOIN factor_emision_producto f ON f.id_producto = p.id_producto
     WHERE f.id_factor IS NULL`
  );
  const filas = [];
  for (const p of productos) {
    const c = clasificar(p.nombre);
    if (c) filas.push([p.id_producto, c.kgco2, 'Poore & Nemecek (2018), Our World in Data · kg CO2e por kg/l']);
  }
  if (filas.length) {
    await conn.query('INSERT INTO factor_emision_producto (id_producto, kgco2_por_unidad, fuente) VALUES ?', [filas]);
  }
  return filas.length;
}

/** Catálogos base: unidades, Querétaro y sus 18 municipios, medios de transporte. */
async function sembrarBase(conn) {
  const d = new Dimensiones(conn);
  for (const abrev of Object.keys(UNIDADES)) await d.unidad(abrev);
  const idQro = await d.estado('Querétaro');
  for (const m of MUNICIPIOS_QRO) await d.municipio(idQro, m.nombre);
  for (const t of TRANSPORTES) {
    await conn.execute(
      `INSERT INTO medio_transporte (nombre, factor_emision_kgco2_km) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE factor_emision_kgco2_km = VALUES(factor_emision_kgco2_km)`,
      [t.nombre, t.factor]
    );
  }
}

module.exports = { Dimensiones, insertarPrecios, asignarFactores, sembrarBase, kgProducto };
