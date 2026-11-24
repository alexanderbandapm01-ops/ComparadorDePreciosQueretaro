'use strict';
/**
 * Utilidades para leer los datos tal como los deja la ETL (01_limpiar.py / 02_cargar.py).
 * Aquí NO hay datos: las categorías, productos, unidades y factores vienen de MySQL.
 * Solo hay íconos para mostrar cada categoría y conversiones de unidades.
 */

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Ícono por categoría de QQP (solo presentación visual; la clave es el nombre normalizado)
const ICONOS = {
  'HORTALIZAS FRESCAS': '🥕',
  'FRUTAS FRESCAS': '🍎',
  'LECHE PROCESADA': '🥛',
  'LECHE FRESCA': '🍼',
  'LEGUMBRES SECAS': '🫘',
  'CARNE Y VISCERAS DE RES': '🥩',
  'CARNE Y VISCERAS DE CERDO': '🍖',
  'CARNE DE AVE': '🍗',
  HUEVO: '🥚',
  AZUCAR: '🍬',
  CAFE: '☕',
  'DERIVADOS DE LECHE': '🧀',
  'CARNES FRIAS SECAS Y EMBUTIDOS': '🌭',
  'CHOCOLATES Y GOLOSINAS': '🍫',
  'GALLETAS PASTAS Y HARINAS DE TRIGO': '🍝',
  'FRUTAS Y LEGUMBRES PROCESADAS': '🥫',
  PAN: '🍞',
  'ARROZ Y CEREALES PREPARADOS': '🍚',
  'PESCADOS Y MARISCOS EN CONSERVA': '🐟',
  'PESCADOS Y MARISCOS': '🦐',
  'ACEITES Y GRASAS VEG. COMESTIBLES': '🫗',
  'TORTILLAS Y DERIVADOS DEL MAIZ': '🫓',
  'REFRESCOS ENVASADOS': '🥤',
  CONDIMENTOS: '🧂',
  'ALIMENTOS COCINADOS F/CASA': '🍲',
  'GRASAS ANIMALES COMESTIBLES': '🧈',
  TE: '🍵',
  GALLETAS: '🍪',
  'VINOS Y LICORES': '🍷',
  CERVEZA: '🍺',
  'PRODUCTOS DE TEMPORADA (NAVIDENOS)': '🎄',
};

function iconoCategoria(nombre) {
  return ICONOS[normalizar(nombre)] || '🛒';
}

// Conversión a unidad base (kg, l, pza) según la abreviatura que dejó la ETL (Gr, Kg, Lt, Ml, Pza, N/A)
const FACTOR_UNIDAD = {
  KG: ['kg', 1], KGS: ['kg', 1], KILO: ['kg', 1],
  G: ['kg', 0.001], GR: ['kg', 0.001], GRS: ['kg', 0.001],
  L: ['l', 1], LT: ['l', 1], LTS: ['l', 1],
  ML: ['l', 0.001],
  PZA: ['pza', 1], PZAS: ['pza', 1], PIEZA: ['pza', 1],
};

function infoUnidad(abreviatura) {
  const f = FACTOR_UNIDAD[normalizar(abreviatura).replace(/\.$/, '')];
  return f ? { base: f[0], factor: f[1] } : null;
}

/** Cantidad en unidad base (kg, l o pza). Null si no se puede calcular. */
function cantidadBase(cantidad, abreviatura) {
  const u = infoUnidad(abreviatura);
  if (!u || cantidad == null || !(Number(cantidad) > 0)) return null;
  return Number(cantidad) * u.factor;
}

function unidadBase(abreviatura) {
  const u = infoUnidad(abreviatura);
  return u ? u.base : null;
}

/** kg (o litros, ~kg) de producto en una presentación, para la huella. Las piezas no se convierten. */
function kgProducto(cantidad, abreviatura) {
  const u = infoUnidad(abreviatura);
  if (!u || u.base === 'pza') return null;
  return cantidadBase(cantidad, abreviatura);
}

module.exports = { normalizar, iconoCategoria, cantidadBase, unidadBase, kgProducto };
