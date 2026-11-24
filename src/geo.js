'use strict';
/** Utilidades geográficas y de transporte para Querétaro. */

// Rectángulo que contiene al estado de Querétaro (con un pequeño margen)
const BBOX_ESTADO = { latMin: 20.0, latMax: 21.7, lonMin: -100.65, lonMax: -99.0 };
// Zona metropolitana: Querétaro, Corregidora, El Marqués y Huimilpan (norte)
const BBOX_METRO = { latMin: 20.45, latMax: 20.82, lonMin: -100.56, lonMax: -100.2 };

// Cabeceras municipales (aprox.), para centrar el mapa si no hay GPS
const MUNICIPIOS_QRO = [
  { nombre: 'Querétaro', lat: 20.5888, lon: -100.3899 },
  { nombre: 'Corregidora', lat: 20.5394, lon: -100.4413 },
  { nombre: 'El Marqués', lat: 20.6047, lon: -100.3297 },
  { nombre: 'San Juan del Río', lat: 20.3889, lon: -99.9961 },
  { nombre: 'Tequisquiapan', lat: 20.5206, lon: -99.8917 },
  { nombre: 'Pedro Escobedo', lat: 20.5019, lon: -100.1408 },
  { nombre: 'Huimilpan', lat: 20.3725, lon: -100.275 },
  { nombre: 'Colón', lat: 20.7853, lon: -100.0469 },
  { nombre: 'Ezequiel Montes', lat: 20.665, lon: -99.8994 },
  { nombre: 'Cadereyta de Montes', lat: 20.6936, lon: -99.815 },
  { nombre: 'Amealco de Bonfil', lat: 20.1881, lon: -100.1439 },
  { nombre: 'Tolimán', lat: 20.9097, lon: -99.9311 },
  { nombre: 'Peñamiller', lat: 21.0533, lon: -99.815 },
  { nombre: 'San Joaquín', lat: 20.9156, lon: -99.5653 },
  { nombre: 'Pinal de Amoles', lat: 21.1356, lon: -99.6261 },
  { nombre: 'Jalpan de Serra', lat: 21.2167, lon: -99.4733 },
  { nombre: 'Landa de Matamoros', lat: 21.1842, lon: -99.3203 },
  { nombre: 'Arroyo Seco', lat: 21.5467, lon: -99.6889 },
];

/**
 * Parámetros de cada medio de transporte. El nombre coincide con la tabla
 * medio_transporte; el factor de emisión (kg CO2e por km) vive en la BD.
 * velocidad: km/h promedio urbano · espera: min por trayecto
 * costoKm: $/km · costoTrayecto: $ fijo por cada trayecto (pasaje, banderazo)
 */
const TRANSPORTES = [
  { nombre: 'Caminando', icono: '🚶', factor: 0, velocidad: 4.5, espera: 0, costoKm: 0, costoTrayecto: 0 },
  { nombre: 'Bicicleta', icono: '🚲', factor: 0, velocidad: 14, espera: 0, costoKm: 0, costoTrayecto: 0 },
  { nombre: 'Transporte público', icono: '🚌', factor: 0.089, velocidad: 16, espera: 10, costoKm: 0, costoTrayecto: 11 },
  { nombre: 'Motocicleta', icono: '🏍️', factor: 0.103, velocidad: 28, espera: 0, costoKm: 1.1, costoTrayecto: 0 },
  { nombre: 'Automóvil', icono: '🚗', factor: 0.192, velocidad: 25, espera: 3, costoKm: 2.6, costoTrayecto: 0 },
  { nombre: 'Taxi / app', icono: '🚕', factor: 0.192, velocidad: 25, espera: 6, costoKm: 8.5, costoTrayecto: 35 },
];

// Las calles no son líneas rectas: distancia real ≈ distancia en línea recta × 1.35
const FACTOR_RODEO = 1.35;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function kmCalle(a, b) {
  return haversineKm(a.lat, a.lon, b.lat, b.lon) * FACTOR_RODEO;
}

function dentroDe(bbox, lat, lon) {
  return lat >= bbox.latMin && lat <= bbox.latMax && lon >= bbox.lonMin && lon <= bbox.lonMax;
}

module.exports = { BBOX_ESTADO, BBOX_METRO, MUNICIPIOS_QRO, TRANSPORTES, FACTOR_RODEO, haversineKm, kmCalle, dentroDe };
