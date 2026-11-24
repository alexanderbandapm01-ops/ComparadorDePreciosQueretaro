'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'comparador_precios_sostenible',
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
};

let pool;
function getPool() {
  if (!pool) pool = mysql.createPool({ ...config, connectionLimit: 10, waitForConnections: true });
  return pool;
}

/** Conexión suelta (para scripts). sinBase=true para conectarse sin elegir base de datos. */
function conectar({ sinBase = false, multipleStatements = false } = {}) {
  const c = { ...config, multipleStatements };
  if (sinBase) delete c.database;
  return mysql.createConnection(c);
}

module.exports = { getPool, conectar, config };
