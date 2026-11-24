'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { iconoCategoria, cantidadBase, unidadBase, kgProducto, normalizar } = require('../src/canasta');
const { dentroDe, BBOX_ESTADO } = require('../src/geo');

test('unidades tal como las deja la ETL (Gr, Kg, Lt, Ml, Pza, N/A)', () => {
  assert.equal(cantidadBase(900, 'Gr'), 0.9);
  assert.equal(cantidadBase(1, 'Kg'), 1);
  assert.equal(cantidadBase(850, 'Ml'), 0.85);
  assert.equal(unidadBase('Lt'), 'l');
  assert.equal(unidadBase('Pza'), 'pza');
  assert.equal(cantidadBase(1, 'N/A'), null);
  assert.equal(cantidadBase(null, 'Kg'), null);
  assert.equal(kgProducto(12, 'Pza'), null);
  assert.equal(kgProducto(500, 'Gr'), 0.5);
});

test('íconos por categoría de QQP, sin importar acentos', () => {
  assert.equal(iconoCategoria('Leche Procesada'), '🥛');
  assert.equal(iconoCategoria('Azúcar'), '🍬');
  assert.equal(iconoCategoria('Categoría nueva'), '🛒');
  assert.equal(normalizar(' Querétaro '), 'QUERETARO');
});

test('rectángulo de Querétaro', () => {
  assert.ok(dentroDe(BBOX_ESTADO, 20.5888, -100.3899)); // Querétaro
  assert.ok(!dentroDe(BBOX_ESTADO, 20.52, -100.81)); // Celaya
  assert.ok(!dentroDe(BBOX_ESTADO, 21.854, -102.294)); // Aguascalientes
});
