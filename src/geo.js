'use strict';
/** Utilidades geográficas y de transporte para Querétaro. */

// Rectángulo que contiene al estado de Querétaro (con un pequeño margen)
const BBOX_ESTADO = { latMin: 20.0, latMax: 21.7, lonMin: -100.65, lonMax: -99.0 };
// Zona metropolitana: Querétaro, Corregidora, El Marqués y Huimilpan (norte)
const BBOX_METRO = { latMin: 20.45, latMax: 20.82, lonMin: -100.56, lonMax: -100.2 };

/**
 * Parámetros de cada medio de transporte (supuestos del modelo, no datos de QQP).
 * Si la tabla medio_transporte tiene un registro con el mismo nombre, su
 * factor_emision_kgco2_km reemplaza al de aquí. Al guardar una lista, el medio
 * usado se registra en medio_transporte para poder llenar distancia_usuario_sucursal.
 * velocidad: km/h promedio urbano · espera: min por trayecto
 * costoKm: $/km · costoTrayecto: $ fijo por cada trayecto (pasaje, banderazo)
 */
const TRANSPORTES = [
  { clave: 'caminando', nombre: 'Caminando', icono: '🚶', factor: 0, velocidad: 4.5, espera: 0, costoKm: 0, costoTrayecto: 0 },
  { clave: 'bicicleta', nombre: 'Bicicleta', icono: '🚲', factor: 0, velocidad: 14, espera: 0, costoKm: 0, costoTrayecto: 0 },
  { clave: 'publico', nombre: 'Transporte público', icono: '🚌', factor: 0.089, velocidad: 16, espera: 10, costoKm: 0, costoTrayecto: 11 },
  { clave: 'moto', nombre: 'Motocicleta', icono: '🏍️', factor: 0.103, velocidad: 28, espera: 0, costoKm: 1.1, costoTrayecto: 0 },
  { clave: 'auto', nombre: 'Automóvil', icono: '🚗', factor: 0.192, velocidad: 25, espera: 3, costoKm: 2.6, costoTrayecto: 0 },
  { clave: 'taxi', nombre: 'Taxi / app', icono: '🚕', factor: 0.192, velocidad: 25, espera: 6, costoKm: 8.5, costoTrayecto: 35 },
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

module.exports = { BBOX_ESTADO, BBOX_METRO, TRANSPORTES, FACTOR_RODEO, haversineKm, kmCalle, dentroDe };
