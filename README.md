# 🌿 CDPS Sostenible: Comparador de Precios en Querétaro

Página web responsiva (celular y computadora). La persona arma su canasta con los productos de **Quién es Quién en los Precios (QQP, PROFECO)** y la página le dice **dónde comprarla**, según tres criterios:

- 💰 **Precio:** incluye lo que gasta en transporte.
- ⚡ **Tiempo de traslado:** a pie, en bici, en camión, en moto, en auto o en taxi/app.
- 🌱 **Huella de carbono:** del viaje y, si la base tiene factores, de los productos.

**La página no inventa datos.** Todo sale de la base `comparador_precios_sostenible` que llenan `01_limpiar.py` y `02_cargar.py` con los CSV limpios.

## ¿Cómo se conecta todo?

```
datos/*.csv (QQP) ──01_limpiar.py──▶ salida/limpio_*.csv ──02_cargar.py──▶ MySQL :3306 (root)
                                                                              │
                     Navegador ◀── http://localhost:3000 ── servidor Node (src/server.js)
```

Un HTML no se puede conectar directo a MySQL. El servidor Node hace de puente: sirve la página y consulta la base.

| CSV limpio | Tabla | Uso en la página |
|---|---|---|
| `limpio_presentaciones.csv` (categoria, marca, producto…) | `categoria`, `marca`, `producto`, `presentacion`, `unidad_medida` | Botones por **categoría**, búsqueda, precio por kg/l, "cualquier marca" (mismo producto, unidad y cantidad) |
| `limpio_catalogos.csv` | `catalogo`, `presentacion_catalogo` | Filtro por **catálogo** (Pacic, Basicos, Mercados, Frutas y Legumbres…) y botón **Canasta PACIC** |
| `limpio_sucursales.csv` | `estado`, `municipio`, `cadena_comercial`, `giro`, `sucursal` | Mapa, distancias, rutas, lista de municipios |
| `limpio_fuentes.csv` | `fuente_datos` | Periodo de los datos que se muestra en la página |
| precios | `registro_precio` | Precio más reciente por presentación y sucursal |
| `mapeo_huella.csv` (`kgco2e_por_kg`) | `factor_emision_producto` | Huella de los productos (si está vacía, solo se cuenta el viaje) |

El alcance (las 28 categorías con `en_alcance = si`) se define en tu ETL. La página muestra las categorías que haya en la base.

### Solo Querétaro

Los CSV limpios traen sucursales de todo el país (1,421). El servidor muestra solo las que están **dentro del rectángulo de Querétaro (latitud/longitud) y cuyo estado es Querétaro**: 26 sucursales con los archivos actuales. No se borra nada de la base. Se cambia en `.env`:

```
ZONA=queretaro   # estado de Querétaro (por defecto)
ZONA=metro       # solo la zona metropolitana
ZONA=todo        # todo el país
```

## Instalación

Necesitas **Node.js 18+** ([nodejs.org](https://nodejs.org)), **Python** (para tu ETL) y **MySQL 8** en el puerto 3306.

```bash
# 1. Crear la base: ejecuta comparador_precios_sostenible_sin_comentarios.sql en Workbench
#    (o desde aquí: npm run db:init, que usa el mismo script de database/schema.sql)

# 2. Limpiar y cargar los datos con tu ETL
python 01_limpiar.py
python 02_cargar.py

# 3. Página web
npm install
copy .env.example .env        # Windows (cp en Mac/Linux); escribe tu contraseña de root
npm start
```

Abre **http://localhost:3000** 🎉

## Funciones

| | |
|---|---|
| 📍 Ubicación | GPS, municipio (sacado de las sucursales de la base) o un toque en el mapa |
| 🚌 Transporte | 6 medios con velocidad, costo y CO₂ por km |
| 🧺 Canasta | Búsqueda sin importar acentos, filtro por catálogo, botones por categoría, "Canasta PACIC" y opción "Cualquier marca" |
| ⚖️ Prioridad | Ahorrar · Equilibrio · Rapidez · Planeta, más ajuste fino |
| 🏆 Planes | Recomendado, Más barato, Más rápido, Menor huella, Todo en una tienda, Cada producto a su mínimo, con explicación de cada uno |
| 🗺️ Ruta | Tiendas numeradas en el mapa y botón para abrir la ruta en Google Maps |
| 📊 Comparativa | Las 5 tiendas más baratas de cada producto y el promedio de la zona |
| 💾 Cuenta | Registro e inicio de sesión. Guarda en `usuario`, `lista_compra`, `item_lista`, `recomendacion` y `distancia_usuario_sucursal` |

### Supuestos del modelo (no son datos de QQP)

Están en `src/geo.js` y se pueden ajustar:

- **Distancia:** línea recta × 1.35, porque las calles no son rectas.
- **Tiempo en tienda:** 12 min por tienda.
- **Transporte:** velocidad, costo por km y pasaje de cada medio.
- **Emisiones del viaje:** factor de CO₂ por km de cada medio. Si la tabla `medio_transporte` tiene un factor con el mismo nombre, se usa ese. Al guardar una lista, el medio usado se registra en `medio_transporte` para llenar `distancia_usuario_sucursal`.
- **Precios usados:** los de los últimos 120 días antes del precio más reciente (`VENTANA_DIAS` en `.env`).

## Estructura

```
database/schema.sql     Tu esquema MySQL
src/server.js           API + página (Express)
src/recomendador.js     Algoritmo de planes de compra
src/canasta.js          Íconos por categoría y conversión de unidades (Gr, Kg, Lt, Ml, Pza)
src/geo.js              Rectángulo de Querétaro y parámetros de transporte
scripts/init-db.js      Crea la base vacía desde schema.sql
public/                 HTML, CSS y JS de la página
test/                   Pruebas (npm test)
```

## Problemas comunes

- **"No hay conexión con MySQL":** enciende el servicio MySQL80 y revisa `DB_PORT=3306`.
- **"Access denied":** la contraseña de root en `.env` no es correcta.
- **"No hay precios de la zona":** falta correr `02_cargar.py`, o la zona no tiene sucursales (prueba `ZONA=todo`).
- **El mapa sale gris:** el fondo del mapa se descarga de internet.
