'use strict';
/**
 * Importador del dataset "Quién es Quién en los Precios" (QQP) de PROFECO.
 *
 * Lee uno o varios CSV (o carpetas con CSV), se queda SOLO con:
 *   1) registros cuya latitud/longitud cae en Querétaro, y
 *   2) productos de la canasta básica (ver src/canasta.js),
 * y los normaliza en las tablas de comparador_precios_sostenible.
 *
 * Uso:
 *   npm run importar -- C:\Descargas\QQP\2026_10.csv
 *   npm run importar -- C:\Descargas\QQP          (todos los .csv de la carpeta)
 *
 * Opciones:
 *   --zona=metro         solo zona metropolitana (Querétaro, Corregidora, El Marqués)
 *   --solo-coordenadas   no revisar la columna ESTADO, filtrar únicamente por lat/lon
 *   --todo               importar todos los productos, no solo la canasta básica
 *   --encoding=latin1    forzar codificación (por defecto se detecta sola)
 *   --conservar-demo     no borrar los datos de demostración
 *
 * Columnas QQP esperadas (con o sin encabezado, en este orden):
 *   PRODUCTO, PRESENTACION, MARCA, CATEGORIA, CATALOGO, PRECIO, FECHAREGISTRO,
 *   CADENACOMERCIAL, GIRO, NOMBRECOMERCIAL, DIRECCION, ESTADO, MUNICIPIO, LATITUD, LONGITUD
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { conectar } = require('../src/db');
const { normalizar, clasificar } = require('../src/canasta');
const { BBOX_ESTADO, BBOX_METRO, dentroDe } = require('../src/geo');
const { Dimensiones, insertarPrecios, asignarFactores, sembrarBase } = require('./lib/dimensiones');
const { borrarDemo } = require('./lib/demo');

const COLUMNAS = [
  'producto', 'presentacion', 'marca', 'categoria', 'catalogo', 'precio', 'fecharegistro',
  'cadenacomercial', 'giro', 'nombrecomercial', 'direccion', 'estado', 'municipio', 'latitud', 'longitud',
];

/** Separa una línea CSV respetando comillas. */
function partirCSV(linea, sep = ',') {
  const out = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { out.push(campo); campo = ''; }
    else campo += ch;
  }
  out.push(campo);
  return out;
}

/** "AV. CONSTITUYENTES 123, COL. CENTRO, C.P. 76000" → calle, colonia, cp */
function partirDireccion(dir) {
  const d = String(dir || '').replace(/\s+/g, ' ').trim();
  const cpM = d.match(/C\.?\s*P\.?\s*:?\s*(\d{5})/i) || d.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
  const colM = d.match(/\b(?:COL(?:ONIA)?|FRACC(?:IONAMIENTO)?|BARRIO|BO)\.?\s+([^,]+)/i);
  let calle = d.split(/,\s*(?:COL(?:ONIA)?\.?|FRACC|BARRIO|C\.?\s*P\.?)/i)[0];
  if (!calle || calle.length < 3) calle = d.split(',')[0];
  return {
    calle: (calle || 'SIN CALLE').replace(/,\s*$/, '').trim(),
    colonia: colM ? colM[1].replace(/C\.?\s*P\.?.*$/i, '').trim() : 'SIN COLONIA',
    cp: cpM ? cpM[1] : '00000',
  };
}

function parseFecha(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/aaaa
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function detectarEncoding(archivo) {
  const fd = fs.openSync(archivo, 'r');
  const buf = Buffer.alloc(256 * 1024);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  try {
    // Recortamos el final por si cortamos un carácter multibyte a la mitad
    new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, Math.max(0, n - 4)));
    return 'utf8';
  } catch {
    return 'latin1';
  }
}

function listarArchivos(rutas) {
  const out = [];
  for (const r of rutas) {
    const st = fs.statSync(r);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(r).sort()) if (/\.(csv|txt)$/i.test(f)) out.push(path.join(r, f));
    } else out.push(r);
  }
  return out;
}

async function importarArchivo(conn, dim, archivo, op) {
  const encoding = op.encoding || detectarEncoding(archivo);
  const bbox = op.zona === 'metro' ? BBOX_METRO : BBOX_ESTADO;
  let indices = null;
  let sep = ',';
  const est = { leidas: 0, fueraZona: 0, noCanasta: 0, invalidas: 0, importadas: 0 };
  const precios = new Map(); // dedup dentro del archivo
  let fechaMin = null;
  let fechaMax = null;
  const idFuente = await dim.fuente(path.basename(archivo), null);
  // Se crea después de todo await: si no, readline puede emitir líneas antes de que el ciclo las escuche
  const rl = readline.createInterface({ input: fs.createReadStream(archivo, { encoding }), crlfDelay: Infinity });

  for await (let linea of rl) {
    if (!linea.trim()) continue;
    if (!indices) {
      linea = linea.replace(/^\uFEFF/, '');
      if (!linea.includes(',') && linea.includes(';')) sep = ';';
      const enc = partirCSV(linea, sep).map((c) => normalizar(c).replace(/[^A-Z]/g, '').toLowerCase());
      if (enc.includes('producto') && enc.includes('precio')) {
        indices = Object.fromEntries(COLUMNAS.map((c) => [c, enc.indexOf(c)]));
        const faltan = COLUMNAS.filter((c) => indices[c] < 0);
        if (faltan.length) console.warn(`   ⚠ Columnas no encontradas: ${faltan.join(', ')}`);
        continue;
      }
      indices = Object.fromEntries(COLUMNAS.map((c, i) => [c, i])); // sin encabezado
    }
    est.leidas++;
    const f = partirCSV(linea, sep);
    const v = (c) => (indices[c] >= 0 ? (f[indices[c]] ?? '').trim() : '');

    const lat = Number(v('latitud'));
    const lon = Number(v('longitud'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon || !dentroDe(bbox, lat, lon)) { est.fueraZona++; continue; }
    if (!op.soloCoordenadas && v('estado') && !normalizar(v('estado')).includes('QUERETARO')) { est.fueraZona++; continue; }

    const producto = v('producto');
    if (!op.todo && !clasificar(producto, v('catalogo'))) { est.noCanasta++; continue; }

    const precio = Number(v('precio').replace(/[$,\s]/g, ''));
    const fecha = parseFecha(v('fecharegistro'));
    if (!producto || !Number.isFinite(precio) || precio <= 0 || precio > 100000 || !fecha) { est.invalidas++; continue; }

    const idEstado = await dim.estado(v('estado') || 'Querétaro');
    const idMunicipio = await dim.municipio(idEstado, v('municipio'));
    const idCatalogo = v('catalogo') ? await dim.catalogo(v('catalogo')) : null;
    const idProducto = await dim.producto(await dim.categoria(v('categoria')), await dim.marca(v('marca')), producto);
    const idPres = await dim.presentacion(idProducto, v('presentacion'), idCatalogo);
    const dir = partirDireccion(v('direccion'));
    const idSuc = await dim.sucursal({
      idCadena: await dim.cadena(v('cadenacomercial') || v('nombrecomercial')),
      idMunicipio,
      idGiro: await dim.giro(v('giro')),
      nombre: v('nombrecomercial') || v('cadenacomercial'),
      ...dir,
      lat,
      lon,
    });

    precios.set(`${idPres}|${idSuc}|${fecha}`, [idPres, idSuc, idFuente, fecha, precio]);
    if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
    if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    est.importadas++;

    if (precios.size >= 5000) {
      await insertarPrecios(conn, [...precios.values()]);
      precios.clear();
    }
    if (est.leidas % 200000 === 0) process.stdout.write(`   … ${est.leidas.toLocaleString('es-MX')} filas leídas, ${est.importadas.toLocaleString('es-MX')} útiles\r`);
  }
  await insertarPrecios(conn, [...precios.values()]);

  const periodo = fechaMin ? (fechaMin.slice(0, 7) === fechaMax.slice(0, 7) ? fechaMax.slice(0, 7) : `${fechaMin} a ${fechaMax}`) : null;
  if (est.importadas) await conn.execute('UPDATE fuente_datos SET periodo = ? WHERE id_fuente = ?', [periodo, idFuente]);
  else await conn.execute('DELETE FROM fuente_datos WHERE id_fuente = ?', [idFuente]);
  return { ...est, encoding, periodo };
}

async function main() {
  const args = process.argv.slice(2);
  const rutas = args.filter((a) => !a.startsWith('--'));
  const opt = (n) => args.find((a) => a.startsWith(`--${n}`));
  const op = {
    zona: (opt('zona') || '').split('=')[1] || 'estado',
    soloCoordenadas: !!opt('solo-coordenadas'),
    todo: !!opt('todo'),
    encoding: (opt('encoding') || '').split('=')[1] || null,
  };
  if (!rutas.length) {
    console.log('Uso: npm run importar -- <archivo.csv | carpeta> [--zona=metro] [--solo-coordenadas] [--todo]');
    process.exit(1);
  }
  const archivos = listarArchivos(rutas);
  if (!archivos.length) throw new Error('No encontré archivos .csv en: ' + rutas.join(', '));

  const conn = await conectar();
  try {
    await sembrarBase(conn);
    if (!opt('conservar-demo')) {
      const b = await borrarDemo(conn);
      if (b) console.log(`🧹 Se borraron ${b} precios de demostración.`);
    }
    const dim = new Dimensiones(conn);
    for (const a of archivos) {
      console.log(`📄 ${a}`);
      const t0 = Date.now();
      const r = await importarArchivo(conn, dim, a, op);
      console.log(
        `   ✔ ${r.importadas.toLocaleString('es-MX')} precios de Querétaro / canasta básica` +
          ` (de ${r.leidas.toLocaleString('es-MX')} filas; ${r.fueraZona.toLocaleString('es-MX')} fuera de la zona,` +
          ` ${r.noCanasta.toLocaleString('es-MX')} fuera de la canasta, ${r.invalidas} inválidas)` +
          ` · ${r.encoding} · periodo ${r.periodo || '—'} · ${((Date.now() - t0) / 1000).toFixed(1)} s`
      );
    }
    const n = await asignarFactores(conn);
    if (n) console.log(`🌱 Factores de emisión asignados a ${n} productos.`);
    const [[t]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM sucursal) sucursales, (SELECT COUNT(*) FROM presentacion) presentaciones,
              (SELECT COUNT(*) FROM registro_precio) precios`
    );
    console.log(`✅ Listo. En la base: ${t.sucursales} sucursales, ${t.presentaciones} presentaciones, ${t.precios} precios.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error al importar:', e.message);
    process.exit(1);
  });
}

module.exports = { partirCSV, partirDireccion, parseFecha };
