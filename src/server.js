'use strict';
/**
 * Servidor web de CDPS Sostenible.
 * Un navegador no puede conectarse directo a MySQL (puerto 3306), así que este
 * servidor Node hace de puente: sirve la página en http://localhost:3000 y
 * expone una API JSON que consulta la base comparador_precios_sostenible.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getPool, config } = require('./db');
const { CANASTA, clasificar, normalizar, kgProducto, cantidadBase, unidadBase } = require('./canasta');
const { TRANSPORTES, MUNICIPIOS_QRO, kmCalle } = require('./geo');
const { recomendar } = require('./recomendador');

const PORT = Number(process.env.PORT || 3000);
const VENTANA_DIAS = Number(process.env.VENTANA_DIAS || 120); // antigüedad máxima de un precio para usarlo
const SECRETO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const db = getPool();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
// Leaflet (mapas) se sirve desde node_modules para no depender de un CDN
app.use('/vendor/leaflet', express.static(path.join(path.dirname(require.resolve('leaflet/package.json')), 'dist')));

// ---------------------------------------------------------------------------
// Cachés (los datos de QQP cambian poco; se recargan cada 5 minutos)
// ---------------------------------------------------------------------------
let cache = { hasta: 0 };
async function datos() {
  if (Date.now() < cache.hasta) return cache;
  const [[{ fechaMax }]] = await db.query('SELECT MAX(fecha_registro) fechaMax FROM registro_precio');
  const desde = fechaMax
    ? new Date(new Date(fechaMax + 'T00:00:00Z').getTime() - VENTANA_DIAS * 864e5).toISOString().slice(0, 10)
    : '1900-01-01';

  const [sucursales] = await db.query(
    `SELECT s.id_sucursal id, s.nombre_comercial nombre, c.nombre cadena, g.nombre giro, mu.nombre municipio,
            s.calle, s.colonia, s.codigo_postal cp, ST_Latitude(s.ubicacion) lat, ST_Longitude(s.ubicacion) lon
       FROM sucursal s
       JOIN cadena_comercial c ON c.id_cadena = s.id_cadena
       JOIN giro g ON g.id_giro = s.id_giro
       JOIN municipio mu ON mu.id_municipio = s.id_municipio
      WHERE EXISTS (SELECT 1 FROM registro_precio r WHERE r.id_sucursal = s.id_sucursal AND r.fecha_registro >= ?)`,
    [desde]
  );

  const [pres] = await db.query(
    `SELECT p.id_presentacion id, pr.nombre producto, m.nombre marca, ca.nombre categoria, p.descripcion_original descripcion,
            p.cantidad, u.abreviatura unidad, f.kgco2_por_unidad kgco2,
            MIN(r.precio) min, MAX(r.precio) max, AVG(r.precio) promedio, COUNT(DISTINCT r.id_sucursal) tiendas
       FROM presentacion p
       JOIN producto pr ON pr.id_producto = p.id_producto
       JOIN marca m ON m.id_marca = pr.id_marca
       JOIN categoria ca ON ca.id_categoria = pr.id_categoria
       JOIN unidad_medida u ON u.id_unidad = p.id_unidad
       JOIN registro_precio r ON r.id_presentacion = p.id_presentacion AND r.fecha_registro >= ?
       LEFT JOIN factor_emision_producto f ON f.id_producto = pr.id_producto
      GROUP BY p.id_presentacion, pr.nombre, m.nombre, ca.nombre, p.descripcion_original, p.cantidad, u.abreviatura, f.kgco2_por_unidad`,
    [desde]
  );
  const presentaciones = pres.map((p) => {
    const c = clasificar(p.producto);
    const base = cantidadBase(p.cantidad, p.unidad);
    const kg = kgProducto(p.cantidad, p.unidad, c && c.clave);
    const factor = p.kgco2 != null ? Number(p.kgco2) : c ? c.kgco2 : null;
    return {
      ...p,
      promedio: Math.round(p.promedio * 100) / 100,
      clave: c ? c.clave : null,
      emoji: c ? c.emoji : '🛒',
      unidadBase: base ? unidadBase(p.unidad) : null,
      precioUnitarioMin: base ? Math.round((p.min / base) * 100) / 100 : null,
      huella: kg != null && factor != null ? Math.round(kg * factor * 1000) / 1000 : null,
      texto: normalizar(`${p.producto} ${p.marca} ${p.descripcion} ${c ? c.nombre : ''}`),
      grupo: `${normalizar(p.producto)}|${p.unidad}|${p.cantidad}`,
    };
  });

  const [fuentes] = await db.query('SELECT nombre_archivo, periodo, fecha_carga FROM fuente_datos ORDER BY fecha_carga DESC LIMIT 5');
  const [transDb] = await db.query('SELECT id_transporte id, nombre, factor_emision_kgco2_km factor FROM medio_transporte');
  const transportes = transDb.map((t) => {
    const cfg = TRANSPORTES.find((x) => normalizar(x.nombre) === normalizar(t.nombre)) || TRANSPORTES[4];
    return { ...cfg, id: t.id, nombre: t.nombre, factor: Number(t.factor) };
  });

  cache = {
    hasta: Date.now() + 5 * 60 * 1000,
    fechaMax,
    desde,
    sucursales,
    sucPorId: new Map(sucursales.map((s) => [s.id, s])),
    presentaciones,
    presPorId: new Map(presentaciones.map((p) => [p.id, p])),
    fuentes,
    transportes,
    demo: fuentes.some((f) => /^DEMO/.test(f.nombre_archivo)),
  };
  return cache;
}

// ---------------------------------------------------------------------------
// Sesiones: token firmado con HMAC (sin dependencias extra)
// ---------------------------------------------------------------------------
function firmar(idUsuario) {
  const cuerpo = Buffer.from(JSON.stringify({ u: idUsuario, e: Date.now() + 30 * 864e5 })).toString('base64url');
  return cuerpo + '.' + crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
}
function verificar(token) {
  const [cuerpo, firma] = String(token || '').split('.');
  if (!cuerpo || !firma) return null;
  const esperado = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  if (firma.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))) return null;
  const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  return d.e > Date.now() ? d.u : null;
}
function hashContrasena(pwd) {
  const sal = crypto.randomBytes(16).toString('hex');
  return `scrypt$${sal}$${crypto.scryptSync(pwd, sal, 64).toString('hex')}`;
}
function revisarContrasena(pwd, guardado) {
  const [, sal, hash] = String(guardado).split('$');
  if (!sal || !hash) return false;
  const calc = crypto.scryptSync(pwd, sal, 64);
  return crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'));
}
function requiereSesion(req, res, next) {
  const id = verificar((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!id) return res.status(401).json({ error: 'Inicia sesión para guardar tus listas.' });
  req.usuario = id;
  next();
}

const envolver = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: mensajeError(e) });
  });

function mensajeError(e) {
  if (e.code === 'ECONNREFUSED') return `No hay conexión con MySQL en ${config.host}:${config.port}. ¿Está encendido?`;
  if (e.code === 'ER_ACCESS_DENIED_ERROR') return 'MySQL rechazó el usuario o contraseña (revisa el archivo .env).';
  if (e.code === 'ER_BAD_DB_ERROR') return `No existe la base "${config.database}". Ejecuta: npm run db:init`;
  if (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_GIS_INVALID_DATA' || e.code === 'ER_WRONG_ARGUMENTS')
    return 'El esquema de la base no coincide (¿versión vieja?). Ejecuta: npm run db:init -- --force';
  return 'Error del servidor: ' + e.message;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/estado', envolver(async (req, res) => {
  const d = await datos();
  res.json({
    ok: true,
    demo: d.demo,
    fechaMax: d.fechaMax,
    desde: d.desde,
    fuentes: d.fuentes,
    sucursales: d.sucursales.length,
    presentaciones: d.presentaciones.length,
    canasta: CANASTA.map((c) => ({
      clave: c.clave,
      nombre: c.nombre,
      emoji: c.emoji,
      opciones: d.presentaciones.filter((p) => p.clave === c.clave).length,
    })),
    transportes: d.transportes.map(({ id, nombre, icono, velocidad }) => ({ id, nombre, icono, velocidad })),
    municipios: MUNICIPIOS_QRO,
  });
}));

app.get('/api/buscar', envolver(async (req, res) => {
  const d = await datos();
  const q = normalizar(req.query.q || '');
  const clave = req.query.clave || '';
  const tokens = q.split(' ').filter(Boolean);
  const resultados = d.presentaciones
    .filter((p) => (!clave || p.clave === clave) && tokens.every((t) => p.texto.includes(t)))
    .sort((a, b) => (a.clave ? 0 : 1) - (b.clave ? 0 : 1) || b.tiendas - a.tiendas || a.min - b.min)
    .slice(0, 40)
    .map(({ texto, grupo, kgco2, ...p }) => p);
  res.json(resultados);
}));

app.get('/api/sucursales', envolver(async (req, res) => {
  const d = await datos();
  res.json(d.sucursales);
}));

app.post('/api/recomendar', envolver(async (req, res) => {
  const d = await datos();
  const b = req.body || {};
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Falta tu ubicación.' });
  const itemsIn = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  const items = itemsIn
    .map((it, i) => ({
      key: 'i' + i,
      id_presentacion: Number(it.id_presentacion),
      cantidad: Math.min(Math.max(Number(it.cantidad) || 1, 0.001), 999),
      flexible: !!it.flexible,
    }))
    .filter((it) => d.presPorId.has(it.id_presentacion));
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto a tu canasta.' });

  const transporte = d.transportes.find((t) => t.id === Number(b.transporte)) || d.transportes.find((t) => /auto/i.test(t.nombre)) || d.transportes[0];
  const radioKm = Math.min(Math.max(Number(b.radioKm) || 8, 0.5), 150);
  const origen = { lat, lon };

  const cercanas = d.sucursales
    .map((s) => ({ ...s, km: kmCalle(origen, s) }))
    .filter((s) => s.km <= radioKm);

  // Presentaciones aceptables por artículo ("cualquier marca" = mismo producto, mismo tamaño)
  const aceptables = new Map();
  for (const it of items) {
    const p = d.presPorId.get(it.id_presentacion);
    const ids = it.flexible ? d.presentaciones.filter((x) => x.grupo === p.grupo).map((x) => x.id) : [p.id];
    aceptables.set(it.key, ids);
  }
  const todasPres = [...new Set([...aceptables.values()].flat())];
  const idsSuc = cercanas.map((s) => s.id);

  const precios = new Map(items.map((it) => [it.key, new Map()]));
  if (idsSuc.length) {
    const [filas] = await db.query(
      `SELECT r.id_presentacion, r.id_sucursal, MIN(r.precio) precio, r.fecha_registro fecha
         FROM registro_precio r
         JOIN (SELECT id_presentacion, id_sucursal, MAX(fecha_registro) f
                 FROM registro_precio
                WHERE id_presentacion IN (?) AND id_sucursal IN (?) AND fecha_registro >= ?
                GROUP BY id_presentacion, id_sucursal) u
           ON u.id_presentacion = r.id_presentacion AND u.id_sucursal = r.id_sucursal AND u.f = r.fecha_registro
        GROUP BY r.id_presentacion, r.id_sucursal, r.fecha_registro`,
      [todasPres, idsSuc, d.desde]
    );
    const porPres = new Map();
    for (const f of filas) {
      if (!porPres.has(f.id_presentacion)) porPres.set(f.id_presentacion, []);
      porPres.get(f.id_presentacion).push(f);
    }
    for (const it of items) {
      const mp = precios.get(it.key);
      for (const idPres of aceptables.get(it.key)) {
        const pres = d.presPorId.get(idPres);
        for (const f of porPres.get(idPres) || []) {
          const actual = mp.get(f.id_sucursal);
          if (!actual || f.precio < actual.precio) {
            mp.set(f.id_sucursal, {
              precio: Number(f.precio),
              fecha: f.fecha,
              id_presentacion: idPres,
              marca: pres.marca,
              descripcion: pres.descripcion,
              huella: pres.huella,
            });
          }
        }
      }
    }
  }

  const r = recomendar({
    origen,
    transporte,
    items,
    sucursales: cercanas,
    precios,
    valorTiempo: Number(b.valorTiempo),
    pesoEco: Number(b.pesoEco),
    maxTiendas: Number(b.maxTiendas) || 3,
  });

  const usadas = new Set();
  r.planes.forEach((p) => p.tiendas.forEach((t) => usadas.add(t.id)));
  r.comparativa.forEach((c) => c.opciones.forEach((o) => usadas.add(o.sucursal)));
  const kmPorId = new Map(cercanas.map((s) => [s.id, s.km]));

  res.json({
    transporte: { id: transporte.id, nombre: transporte.nombre, icono: transporte.icono },
    radioKm,
    sucursalesEnRadio: cercanas.length,
    items: items.map((it) => {
      const p = d.presPorId.get(it.id_presentacion);
      return { key: it.key, id_presentacion: it.id_presentacion, cantidad: it.cantidad, flexible: it.flexible, producto: p.producto, marca: p.marca, descripcion: p.descripcion, emoji: p.emoji };
    }),
    sucursales: Object.fromEntries(
      [...usadas].map((id) => {
        const s = d.sucPorId.get(id);
        return [id, { ...s, km: Math.round(kmPorId.get(id) * 100) / 100 }];
      })
    ),
    planes: r.planes,
    comparativa: r.comparativa,
    datos: { fechaMax: d.fechaMax, demo: d.demo },
  });
}));

// --- Usuarios ---------------------------------------------------------------
app.post('/api/registro', envolver(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!b.nombre || !b.apellido_paterno || !b.fecha_nacimiento || !/^\S+@\S+\.\S+$/.test(email) || String(b.contrasena || '').length < 6)
    return res.status(400).json({ error: 'Completa nombre, apellido, fecha de nacimiento, correo y una contraseña de 6+ caracteres.' });
  const [mun] = await db.query('SELECT id_municipio FROM municipio WHERE nombre = ? LIMIT 1', [b.municipio || 'Querétaro']);
  if (!mun.length) return res.status(400).json({ error: 'Municipio no válido.' });
  try {
    const [r] = await db.execute(
      `INSERT INTO usuario (nombre, apellido_paterno, apellido_materno, fecha_nacimiento, email, contrasena_hash, id_municipio)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(b.nombre).slice(0, 100), String(b.apellido_paterno).slice(0, 100), b.apellido_materno ? String(b.apellido_materno).slice(0, 100) : null, b.fecha_nacimiento, email, hashContrasena(String(b.contrasena)), mun[0].id_municipio]
    );
    res.json({ token: firmar(r.insertId), usuario: { id: r.insertId, nombre: b.nombre, email } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    throw e;
  }
}));

app.post('/api/login', envolver(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const [u] = await db.query('SELECT id_usuario, nombre, email, contrasena_hash FROM usuario WHERE email = ?', [email]);
  if (!u.length || !revisarContrasena(String(req.body?.contrasena || ''), u[0].contrasena_hash))
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  res.json({ token: firmar(u[0].id_usuario), usuario: { id: u[0].id_usuario, nombre: u[0].nombre, email: u[0].email } });
}));

app.get('/api/yo', requiereSesion, envolver(async (req, res) => {
  const [u] = await db.query(
    `SELECT v.id_usuario id, v.nombre, v.apellido_paterno, v.email, v.edad, m.nombre municipio,
            ST_Latitude(v.ubicacion) lat, ST_Longitude(v.ubicacion) lon
       FROM vista_usuario v JOIN municipio m ON m.id_municipio = v.id_municipio WHERE v.id_usuario = ?`,
    [req.usuario]
  );
  if (!u.length) return res.status(401).json({ error: 'Sesión no válida.' });
  res.json(u[0]);
}));

// --- Listas de compra ---------------------------------------------------------
app.get('/api/listas', requiereSesion, envolver(async (req, res) => {
  const [l] = await db.query(
    `SELECT l.id_lista id, l.nombre, l.descripcion, l.fecha_creacion, l.estado,
            COUNT(DISTINCT i.id_item) productos, ROUND(SUM(r.precio_estimado), 2) total, ROUND(SUM(r.ahorro_estimado), 2) ahorro
       FROM lista_compra l
       LEFT JOIN item_lista i ON i.id_lista = l.id_lista
       LEFT JOIN recomendacion r ON r.id_item = i.id_item
      WHERE l.id_usuario = ?
      GROUP BY l.id_lista ORDER BY l.fecha_creacion DESC`,
    [req.usuario]
  );
  res.json(l);
}));

app.get('/api/listas/:id', requiereSesion, envolver(async (req, res) => {
  const [l] = await db.query('SELECT id_lista id, nombre, descripcion, estado FROM lista_compra WHERE id_lista = ? AND id_usuario = ?', [req.params.id, req.usuario]);
  if (!l.length) return res.status(404).json({ error: 'Lista no encontrada.' });
  const [items] = await db.query('SELECT id_presentacion, cantidad FROM item_lista WHERE id_lista = ?', [req.params.id]);
  const d = await datos();
  res.json({
    ...l[0],
    items: items.map((i) => {
      const p = d.presPorId.get(i.id_presentacion) || {};
      return { id_presentacion: i.id_presentacion, cantidad: Number(i.cantidad), producto: p.producto, marca: p.marca, descripcion: p.descripcion, emoji: p.emoji || '🛒', min: p.min };
    }),
  });
}));

app.delete('/api/listas/:id', requiereSesion, envolver(async (req, res) => {
  const [r] = await db.query('DELETE FROM lista_compra WHERE id_lista = ? AND id_usuario = ?', [req.params.id, req.usuario]);
  res.json({ borradas: r.affectedRows });
}));

app.post('/api/listas', requiereSesion, envolver(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return res.status(400).json({ error: 'La lista está vacía.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [l] = await conn.execute('INSERT INTO lista_compra (id_usuario, nombre, descripcion, estado) VALUES (?, ?, ?, ?)', [
      req.usuario,
      String(b.nombre || 'Mi canasta').slice(0, 100),
      b.descripcion ? String(b.descripcion).slice(0, 255) : null,
      'activa',
    ]);
    // Si una presentación aparece dos veces se suman las cantidades (uq_item)
    const unidos = new Map();
    for (const it of items) {
      const id = Number(it.id_presentacion);
      const prev = unidos.get(id);
      unidos.set(id, { ...it, cantidad: (prev ? prev.cantidad : 0) + (Number(it.cantidad) || 1) });
    }
    for (const it of unidos.values()) {
      const [i] = await conn.execute('INSERT INTO item_lista (id_lista, id_presentacion, cantidad) VALUES (?, ?, ?)', [l.insertId, it.id_presentacion, it.cantidad]);
      const rec = it.recomendacion;
      if (rec && rec.id_sucursal) {
        await conn.execute(
          'INSERT INTO recomendacion (id_item, id_sucursal, precio_estimado, ahorro_estimado, huella_estimada_kgco2) VALUES (?, ?, ?, ?, ?)',
          [i.insertId, rec.id_sucursal, rec.precio_estimado ?? null, rec.ahorro_estimado ?? null, rec.huella ?? null]
        );
      }
    }
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      await conn.execute(`UPDATE usuario SET ubicacion = ST_GeomFromText(?, 4326, 'axis-order=long-lat') WHERE id_usuario = ?`, [`POINT(${lon} ${lat})`, req.usuario]);
      const d = await datos();
      const transporte = Number(b.transporte);
      if (d.transportes.some((t) => t.id === transporte)) {
        for (const idSuc of new Set((b.sucursales || []).map(Number))) {
          const s = d.sucPorId.get(idSuc);
          if (!s) continue;
          await conn.execute(
            `INSERT INTO distancia_usuario_sucursal (id_usuario, id_sucursal, id_transporte, distancia_km) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE distancia_km = VALUES(distancia_km)`,
            [req.usuario, idSuc, transporte, Math.round(kmCalle({ lat, lon }, s) * 1000) / 1000]
          );
        }
      }
    }
    await conn.commit();
    res.json({ id: l.insertId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`🌿 CDPS Sostenible en http://localhost:${PORT}  (MySQL ${config.user}@${config.host}:${config.port}/${config.database})`);
    try {
      const d = await datos();
      console.log(`   ${d.sucursales.length} sucursales y ${d.presentaciones.length} presentaciones con precio${d.demo ? ' (DATOS DEMO)' : ''}.`);
      if (!d.presentaciones.length) console.log('   La base no tiene precios: ejecuta npm run importar -- archivo.csv  o  npm run db:demo');
    } catch (e) {
      console.error('   ⚠', mensajeError(e));
    }
  });
}

module.exports = app;
