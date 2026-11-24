'use strict';
/**
 * Definición de la canasta básica y utilidades para interpretar los textos
 * del dataset "Quién es Quién en los Precios" (QQP) de PROFECO.
 *
 * La lista parte de los 24 productos del Paquete Contra la Inflación y la
 * Carestía (PACIC) y añade algunos básicos de consumo frecuente.
 * Los factores de emisión (kg CO2e por kg o litro de producto) son valores
 * aproximados de Poore & Nemecek (2018), publicados en Our World in Data.
 */

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// patron: se evalúa sobre el nombre del producto normalizado (sin acentos, en mayúsculas)
const CANASTA = [
  { clave: 'aceite', nombre: 'Aceite', emoji: '🫗', patron: /^ACEITE\b/, excluir: /(MOTOR|BEBE|LUBRIC|AUTOMO|CORPORAL|MASAJE)/, kgco2: 6.3 },
  { clave: 'arroz', nombre: 'Arroz', emoji: '🍚', patron: /^ARROZ\b/, kgco2: 4.45 },
  { clave: 'atun', nombre: 'Atún', emoji: '🐟', patron: /^ATUN\b/, kgco2: 6.1 },
  { clave: 'azucar', nombre: 'Azúcar', emoji: '🍬', patron: /^AZUCAR\b/, kgco2: 3.2 },
  { clave: 'res', nombre: 'Carne de res', emoji: '🥩', patron: /^(CARNE DE RES|BISTEC|BISTECK|RES\b|MOLIDA DE RES)/, kgco2: 60 },
  { clave: 'cebolla', nombre: 'Cebolla', emoji: '🧅', patron: /^CEBOLLA\b/, kgco2: 0.5 },
  { clave: 'chile', nombre: 'Chile', emoji: '🌶️', patron: /^CHILES?\b/, excluir: /(EN POLVO|SALSA)/, kgco2: 1.0 },
  { clave: 'cerdo', nombre: 'Carne de cerdo', emoji: '🍖', patron: /^(CHULETA|CARNE DE CERDO|CERDO\b|PIERNA DE CERDO)/, kgco2: 12.3 },
  { clave: 'frijol', nombre: 'Frijol', emoji: '🫘', patron: /^FRIJOL(ES)?\b/, kgco2: 1.8 },
  { clave: 'huevo', nombre: 'Huevo', emoji: '🥚', patron: /^HUEVO\b/, kgco2: 4.7, kgPorPieza: 0.06 },
  { clave: 'jabon', nombre: 'Jabón de tocador', emoji: '🧼', patron: /^JABON (DE )?TOCADOR/, kgco2: 2.0, kgPorPieza: 0.15 },
  { clave: 'jitomate', nombre: 'Jitomate', emoji: '🍅', patron: /^(JITOMATE|TOMATE ROJO|TOMATE SALADET)/, kgco2: 2.1 },
  { clave: 'leche', nombre: 'Leche', emoji: '🥛', patron: /^LECHE\b/, excluir: /(CONDENSADA|EVAPORADA|SABORIZADA|CHOCOLATE|FRESA|VAINILLA|CAJETA)/, kgco2: 3.2 },
  { clave: 'limon', nombre: 'Limón', emoji: '🍋', patron: /^LIMON\b/, kgco2: 0.4 },
  { clave: 'manzana', nombre: 'Manzana', emoji: '🍎', patron: /^MANZANA\b/, kgco2: 0.43 },
  { clave: 'naranja', nombre: 'Naranja', emoji: '🍊', patron: /^NARANJA\b/, excluir: /(JUGO|BEBIDA|REFRESCO)/, kgco2: 0.39 },
  { clave: 'pan', nombre: 'Pan de caja', emoji: '🍞', patron: /^PAN (DE CAJA|BLANCO|INTEGRAL|BLANCO DE CAJA|DE CAJA BLANCO)/, kgco2: 1.6 },
  { clave: 'papa', nombre: 'Papa', emoji: '🥔', patron: /^PAPA\b/, kgco2: 0.46 },
  { clave: 'papel', nombre: 'Papel higiénico', emoji: '🧻', patron: /^PAPEL HIGIENICO/, kgco2: 1.1, kgPorPieza: 0.1 },
  { clave: 'pasta', nombre: 'Pasta para sopa', emoji: '🍝', patron: /^(PASTA PARA SOPA|SOPA DE PASTA|PASTA\b)/, excluir: /(DENTAL|DIENTES|DE TOMATE|PARA PEINAR)/, kgco2: 1.6 },
  { clave: 'pollo', nombre: 'Pollo', emoji: '🍗', patron: /^POLLO\b/, kgco2: 9.9 },
  { clave: 'sardina', nombre: 'Sardina', emoji: '🥫', patron: /^SARDINAS?\b/, kgco2: 3.0 },
  { clave: 'tortilla', nombre: 'Tortilla de maíz', emoji: '🫓', patron: /^TORTILLAS?\b/, kgco2: 1.7 },
  { clave: 'zanahoria', nombre: 'Zanahoria', emoji: '🥕', patron: /^ZANAHORIAS?\b/, kgco2: 0.43 },
  { clave: 'harina', nombre: 'Harina de maíz', emoji: '🌽', patron: /^HARINA DE MAIZ/, kgco2: 1.7 },
  { clave: 'cafe', nombre: 'Café', emoji: '☕', patron: /^CAFE\b/, kgco2: 28.5 },
  { clave: 'sal', nombre: 'Sal', emoji: '🧂', patron: /^SAL\b/, kgco2: 0.3 },
  { clave: 'avena', nombre: 'Avena', emoji: '🥣', patron: /^AVENA\b/, kgco2: 2.5 },
  { clave: 'platano', nombre: 'Plátano', emoji: '🍌', patron: /^PLATANOS?\b/, kgco2: 0.86 },
  { clave: 'detergente', nombre: 'Detergente', emoji: '🧺', patron: /^DETERGENTE\b/, kgco2: 1.5 },
];

const POR_CLAVE = new Map(CANASTA.map((c) => [c.clave, c]));

// Catálogos de QQP que nunca forman parte de la canasta básica
const CATALOGOS_EXCLUIDOS = /(MEDICAMENTO|ELECTRODOMESTICO|MUEBLE|UTILES|JUGUETE|ELECTRONICA|HERRAMIENTA|AUTOMOTRIZ)/;

/** Devuelve la entrada de la canasta a la que pertenece un producto, o null. */
function clasificar(nombreProducto, catalogo) {
  if (catalogo && CATALOGOS_EXCLUIDOS.test(normalizar(catalogo))) return null;
  const n = normalizar(nombreProducto);
  for (const c of CANASTA) {
    if (c.patron.test(n) && !(c.excluir && c.excluir.test(n))) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Interpretación del texto de "presentación" de QQP, p. ej. "CAJA 1 LT. ENTERA"
// ---------------------------------------------------------------------------
const UNIDADES = {
  kg: { nombre: 'Kilogramo', abreviatura: 'kg', tipo: 'masa', aBase: 1 },
  g: { nombre: 'Gramo', abreviatura: 'g', tipo: 'masa', aBase: 0.001 },
  l: { nombre: 'Litro', abreviatura: 'l', tipo: 'volumen', aBase: 1 },
  ml: { nombre: 'Mililitro', abreviatura: 'ml', tipo: 'volumen', aBase: 0.001 },
  pza: { nombre: 'Pieza', abreviatura: 'pza', tipo: 'pieza', aBase: 1 },
  'N/A': { nombre: 'Sin unidad', abreviatura: 'N/A', tipo: 'otro', aBase: null },
};

const ALIAS_UNIDAD = [
  [/^(KGS?|KILOS?|KILOGRAMOS?)$/, 'kg'],
  [/^(GRS?|G|GRAMOS?|GMS?)$/, 'g'],
  [/^(LTS?|L|LITROS?)$/, 'l'],
  [/^(ML|MLS|MILILITROS?)$/, 'ml'],
  [/^(PZAS?|PZS?|PIEZAS?|ROLLOS?|UNIDADES?|BARRAS?|PAQUETES?)$/, 'pza'],
];

const RE_CANTIDAD = /(\d+(?:[.,]\d+)?)\s*(KILOGRAMOS?|KILOS?|KGS?|GRAMOS?|GRS?|GMS?|G|LITROS?|LTS?|L|MILILITROS?|MLS?|PIEZAS?|PZAS?|PZS?|ROLLOS?|UNIDADES?|BARRAS?)\b\.?/;
const ENVASES = new Set(['BOLSA', 'CAJA', 'LATA', 'BOTELLA', 'PAQUETE', 'ENVASE', 'FRASCO', 'SOBRE', 'BARRA', 'TETRAPAK', 'TETRA', 'GALON', 'BOTE', 'CUBETA', 'COSTAL', 'CHAROLA', 'EMPAQUE', 'PET', 'VIDRIO', 'DOYPACK', 'GRANEL']);

function unidadDe(token) {
  const t = normalizar(token).replace(/\.$/, '');
  for (const [re, u] of ALIAS_UNIDAD) if (re.test(t)) return u;
  return null;
}

function parsePresentacion(texto) {
  const original = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const n = normalizar(original);
  let cantidad = null;
  let unidad = 'N/A';
  let resto = n;

  const m = n.match(RE_CANTIDAD);
  if (m) {
    cantidad = Number(m[1].replace(',', '.'));
    unidad = unidadDe(m[2]) || 'N/A';
    resto = (n.slice(0, m.index) + ' ' + n.slice(m.index + m[0].length)).trim();
  } else if (/(^|\s)(KGS?|KILOS?)\.?(\s|$)/.test(n)) {
    // "KG. GRANEL" → 1 kg
    cantidad = 1;
    unidad = 'kg';
    resto = n.replace(/(^|\s)(KGS?|KILOS?)\.?(?=\s|$)/, ' ').trim();
  } else if (/(^|\s)(PZA|PIEZA)\.?(\s|$)/.test(n)) {
    cantidad = 1;
    unidad = 'pza';
    resto = n.replace(/(^|\s)(PZA|PIEZA)\.?(?=\s|$)/, ' ').trim();
  }

  let envase = null;
  const partes = resto.split(/\s+/).filter(Boolean);
  if (partes.length && ENVASES.has(partes[0].replace(/\.$/, ''))) {
    envase = partes.shift().replace(/\.$/, '');
  }
  let variante = partes.join(' ').replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '').trim();
  if (!variante) variante = null;

  return {
    cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : null,
    unidad,
    envase: envase ? envase.slice(0, 50) : null,
    variante: variante ? variante.slice(0, 150) : null,
    descripcion_original: (original || 'SIN PRESENTACION').slice(0, 255),
  };
}

/** Cantidad en unidad base (kg, l o pieza). Null si no se puede calcular. */
function cantidadBase(cantidad, abreviatura) {
  const u = UNIDADES[abreviatura];
  if (!u || u.aBase == null || cantidad == null) return null;
  return Number(cantidad) * u.aBase;
}

/** Unidad base para mostrar precio unitario: "kg", "l" o "pza". */
function unidadBase(abreviatura) {
  const u = UNIDADES[abreviatura];
  if (!u) return null;
  if (u.tipo === 'masa') return 'kg';
  if (u.tipo === 'volumen') return 'l';
  if (u.tipo === 'pieza') return 'pza';
  return null;
}

/** kg (o litros) de producto físico en una presentación, para la huella. */
function kgProducto(cantidad, abreviatura, clave) {
  const base = cantidadBase(cantidad, abreviatura);
  if (base == null) return null;
  const u = UNIDADES[abreviatura];
  if (u.tipo === 'pieza') {
    const c = POR_CLAVE.get(clave);
    return c && c.kgPorPieza ? base * c.kgPorPieza : null;
  }
  return base;
}

module.exports = {
  CANASTA,
  POR_CLAVE,
  UNIDADES,
  normalizar,
  clasificar,
  parsePresentacion,
  cantidadBase,
  unidadBase,
  kgProducto,
};
