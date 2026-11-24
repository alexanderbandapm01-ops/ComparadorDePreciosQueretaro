'use strict';
/**
 * Motor de recomendación. Es una función pura (no toca la base de datos):
 * recibe sucursales, precios y preferencias, y arma "planes de compra"
 * de 1 a 3 tiendas (más el plan "todo al precio mínimo").
 *
 * Cada plan se califica con un costo generalizado en pesos:
 *   productos + transporte + (valor del tiempo × horas) + (peso eco × kg CO2)
 *   + una penalización fuerte por cada producto que no se consigue.
 */
const { kmCalle } = require('./geo');

const MINUTOS_EN_TIENDA = 12;

function permutaciones(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    for (const p of permutaciones(arr.filter((_, j) => j !== i))) out.push([x, ...p]);
  });
  return out;
}

function kmRuta(origen, orden) {
  let km = 0;
  let prev = origen;
  for (const s of orden) {
    km += kmCalle(prev, s);
    prev = s;
  }
  return km + (orden.length ? kmCalle(prev, origen) : 0);
}

/** Mejor orden de visita: exhaustivo hasta 4 tiendas, vecino más cercano + 2-opt después. */
function mejorRuta(origen, tiendas) {
  if (tiendas.length <= 4) {
    let mejor = null;
    for (const p of permutaciones(tiendas)) {
      const km = kmRuta(origen, p);
      if (!mejor || km < mejor.km) mejor = { orden: p, km };
    }
    return mejor || { orden: [], km: 0 };
  }
  const pendientes = tiendas.slice();
  const orden = [];
  let actual = origen;
  while (pendientes.length) {
    let iMin = 0;
    for (let i = 1; i < pendientes.length; i++) {
      if (kmCalle(actual, pendientes[i]) < kmCalle(actual, pendientes[iMin])) iMin = i;
    }
    actual = pendientes.splice(iMin, 1)[0];
    orden.push(actual);
  }
  let mejorKm = kmRuta(origen, orden);
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const cand = orden.slice(0, i).concat(orden.slice(i, j + 1).reverse(), orden.slice(j + 1));
        const km = kmRuta(origen, cand);
        if (km + 1e-9 < mejorKm) {
          orden.splice(0, orden.length, ...cand);
          mejorKm = km;
          mejoro = true;
        }
      }
    }
  }
  return { orden, km: mejorKm };
}

function estadisticas(mapaPrecios, porId) {
  const valores = [...mapaPrecios.entries()].filter(([id]) => porId.has(id)).map(([, p]) => p.precio);
  if (!valores.length) return { min: null, max: null, promedio: null, n: 0 };
  const suma = valores.reduce((a, b) => a + b, 0);
  return { min: Math.min(...valores), max: Math.max(...valores), promedio: suma / valores.length, n: valores.length };
}

/**
 * @param {object} o
 * @param {{lat:number, lon:number}} o.origen
 * @param {object} o.transporte  {factor, velocidad, espera, costoKm, costoTrayecto}
 * @param {Array<{key:string, cantidad:number}>} o.items
 * @param {Array<{id:number, lat:number, lon:number}>} o.sucursales
 * @param {Map<string, Map<number, {precio:number, huella?:number}>>} o.precios
 * @param {number} [o.valorTiempo=60]  $ por hora
 * @param {number} [o.pesoEco=0]       $ por kg CO2e
 */
function recomendar(o) {
  const { origen, transporte, items, sucursales } = o;
  const precios = o.precios;
  const valorTiempo = Number.isFinite(o.valorTiempo) ? o.valorTiempo : 60;
  const pesoEco = Number.isFinite(o.pesoEco) ? o.pesoEco : 0;
  const maxTiendas = Math.min(Math.max(o.maxTiendas || 3, 1), 3);

  const porId = new Map(sucursales.map((s) => [s.id, s]));
  const stats = new Map(items.map((it) => [it.key, estadisticas(precios.get(it.key) || new Map(), porId)]));

  const cache = new Map();
  function evaluar(ids) {
    const clave = ids.slice().sort((a, b) => a - b).join(',');
    if (cache.has(clave)) return cache.get(clave);
    const tiendas = ids.map((id) => porId.get(id));
    const asignacion = {};
    const faltantes = [];
    let costoProductos = 0;
    let co2Productos = 0;
    let penalizacion = 0;
    let ahorro = 0;
    for (const it of items) {
      const mp = precios.get(it.key) || new Map();
      let mejor = null;
      for (const id of ids) {
        const p = mp.get(id);
        if (p && (!mejor || p.precio < mejor.precio)) mejor = { ...p, sucursal: id };
      }
      const st = stats.get(it.key);
      if (!mejor) {
        faltantes.push(it.key);
        penalizacion += (st.max != null ? st.max * 1.5 : 100) * it.cantidad + 40;
        continue;
      }
      const subtotal = mejor.precio * it.cantidad;
      costoProductos += subtotal;
      if (mejor.huella != null) co2Productos += mejor.huella * it.cantidad;
      if (st.promedio != null) ahorro += (st.promedio - mejor.precio) * it.cantidad;
      asignacion[it.key] = { ...mejor, subtotal };
    }
    // Solo se visitan las tiendas donde realmente se compra algo
    const usadas = tiendas.filter((t) => t && Object.values(asignacion).some((a) => a.sucursal === t.id));
    const ruta = mejorRuta(origen, usadas);
    const trayectos = usadas.length ? usadas.length + 1 : 0;
    const minutos = usadas.length
      ? (ruta.km / transporte.velocidad) * 60 + transporte.espera * trayectos + MINUTOS_EN_TIENDA * usadas.length
      : 0;
    const costoTransporte = ruta.km * transporte.costoKm + transporte.costoTrayecto * trayectos;
    const co2Transporte = ruta.km * transporte.factor;
    const score =
      costoProductos + costoTransporte + (valorTiempo * minutos) / 60 + pesoEco * (co2Transporte + co2Productos) + penalizacion;

    const plan = {
      clave: usadas.map((t) => t.id).sort((a, b) => a - b).join(','),
      tiendas: ruta.orden.map((t) => ({
        id: t.id,
        items: items.filter((it) => asignacion[it.key] && asignacion[it.key].sucursal === t.id).map((it) => it.key),
        subtotal: redondear(
          items.reduce((s, it) => s + (asignacion[it.key] && asignacion[it.key].sucursal === t.id ? asignacion[it.key].subtotal : 0), 0)
        ),
      })),
      km: redondear(ruta.km, 2),
      minutos: Math.round(minutos),
      costoProductos: redondear(costoProductos),
      costoTransporte: redondear(costoTransporte),
      costoTotal: redondear(costoProductos + costoTransporte),
      co2Transporte: redondear(co2Transporte, 3),
      co2Productos: redondear(co2Productos, 3),
      co2Total: redondear(co2Transporte + co2Productos, 3),
      ahorroVsPromedio: redondear(ahorro),
      faltantes,
      asignacion,
      score: redondear(score),
      etiquetas: [],
    };
    cache.set(clave, plan);
    return plan;
  }

  if (!sucursales.length || !items.length) {
    return { planes: [], comparativa: comparativa(items, precios, stats, porId) };
  }

  // 1) Una sola tienda: todas las sucursales
  // (se descartan las tiendas que no venden ninguno de los productos)
  const simples = sucursales.map((s) => ({ id: s.id, plan: evaluar([s.id]) })).filter((x) => x.plan.tiendas.length);
  simples.sort((a, b) => a.plan.score - b.plan.score);

  // 2) Combinaciones: las mejores tiendas individuales + las más baratas de cada producto
  const pool = new Set(simples.slice(0, 30).map((x) => x.id));
  for (const it of items) {
    const mp = precios.get(it.key);
    if (!mp) continue;
    [...mp.entries()]
      .filter(([id]) => porId.has(id))
      .sort((a, b) => a[1].precio - b[1].precio)
      .slice(0, 3)
      .forEach(([id]) => pool.add(id));
  }
  const ids = [...pool].slice(0, 45);
  const candidatos = simples.map((x) => x.plan);
  if (maxTiendas >= 2) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) candidatos.push(evaluar([ids[i], ids[j]]));
  }
  if (maxTiendas >= 3) {
    const top = ids.slice(0, 15);
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++)
        for (let k = j + 1; k < top.length; k++) candidatos.push(evaluar([top[i], top[j], top[k]]));
  }

  // 3) Todo al precio mínimo (sin importar cuántas tiendas)
  const idsMin = new Set();
  for (const it of items) {
    const mp = precios.get(it.key);
    if (!mp) continue;
    let mejor = null;
    for (const [id, p] of mp) if (porId.has(id) && (!mejor || p.precio < mejor[1])) mejor = [id, p.precio];
    if (mejor) idsMin.add(mejor[0]);
  }
  const planMinimo = idsMin.size ? evaluar([...idsMin]) : null;
  if (planMinimo) candidatos.push(planMinimo);

  const unicos = new Map();
  for (const p of candidatos) if (p.tiendas.length && !unicos.has(p.clave)) unicos.set(p.clave, p);
  const todos = [...unicos.values()];
  if (!todos.length) return { planes: [], comparativa: comparativa(items, precios, stats, porId) };

  const minFaltantes = Math.min(...todos.map((p) => p.faltantes.length));
  const completos = todos.filter((p) => p.faltantes.length === minFaltantes);
  const minPor = (lista, f) => lista.reduce((m, p) => (f(p) < f(m) || (f(p) === f(m) && p.score < m.score) ? p : m));

  const elegidos = [
    ['recomendado', minPor(todos, (p) => p.score)],
    ['barato', minPor(completos, (p) => p.costoTotal)],
    ['rapido', minPor(completos, (p) => p.minutos)],
    ['eco', minPor(completos, (p) => p.co2Transporte)],
  ];
  const simplesUtiles = todos.filter((p) => p.tiendas.length === 1);
  if (simplesUtiles.length) {
    const maxCubre = Math.min(...simplesUtiles.map((p) => p.faltantes.length));
    elegidos.push(['unaTienda', minPor(simplesUtiles.filter((p) => p.faltantes.length === maxCubre), (p) => p.score)]);
  }
  if (planMinimo) elegidos.push(['minimo', planMinimo]);

  const planes = [];
  for (const [etiqueta, plan] of elegidos) {
    if (!plan.etiquetas.includes(etiqueta)) plan.etiquetas.push(etiqueta);
    if (!planes.includes(plan)) planes.push(plan);
  }
  planes.sort((a, b) => a.score - b.score);

  return { planes, comparativa: comparativa(items, precios, stats, porId) };
}

function comparativa(items, precios, stats, porId) {
  return items.map((it) => {
    const mp = precios.get(it.key) || new Map();
    const opciones = [...mp.entries()]
      .filter(([id]) => porId.has(id))
      .map(([id, p]) => ({ sucursal: id, ...p }))
      .sort((a, b) => a.precio - b.precio);
    const st = stats.get(it.key);
    return {
      key: it.key,
      min: st.min,
      max: st.max,
      promedio: st.promedio != null ? redondear(st.promedio) : null,
      n: st.n,
      opciones: opciones.slice(0, 8),
    };
  });
}

function redondear(x, d = 2) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

module.exports = { recomendar, mejorRuta, MINUTOS_EN_TIENDA };
