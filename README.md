# 🌿 CDPS Sostenible: Comparador de Precios de la canasta básica en Querétaro

Página web responsiva (celular y computadora). La persona arma su canasta básica y la página le dice **dónde comprarla**, según tres criterios:

- 💰 **Precio:** el más barato por producto y por canasta completa, incluido lo que gasta en transporte.
- ⚡ **Tiempo de traslado:** según cómo se mueve (a pie, en bici, en camión, en moto, en auto o en taxi/app).
- 🌱 **Huella de carbono:** del viaje y de los productos.

Arma planes de **1, 2 o 3 tiendas** con su ruta en el mapa. También explica por qué recomienda cada uno, por ejemplo: *"la opción más barata te ahorra $3.52 pero son 23 min más"*. Las listas se pueden guardar en la base de datos MySQL.

Los datos vienen de **Quién es Quién en los Precios (QQP) de PROFECO**. El importador solo conserva los registros cuya **latitud/longitud cae en Querétaro** y que son **productos de la canasta básica** (los 24 del PACIC más algunos básicos).

## ¿Cómo funciona?

```
Navegador (public/)  ──HTTP──▶  Servidor Node (src/server.js, puerto 3000)  ──▶  MySQL (puerto 3306, usuario root)
```

Un HTML no se puede conectar directo a MySQL. El servidor Node hace de puente: sirve la página y consulta la base `comparador_precios_sostenible`.

## Instalación (Windows, Mac o Linux)

Necesitas **Node.js 18 o más nuevo** ([nodejs.org](https://nodejs.org)) y **MySQL 8** encendido en el puerto 3306.

```bash
# 1. Instala las dependencias
npm install

# 2. Configura la conexión: copia .env.example a .env y escribe tu contraseña de root
copy .env.example .env        # en Windows   (cp .env.example .env en Mac/Linux)

# 3. Crea la base de datos (usa database/schema.sql + catálogos de Querétaro)
npm run db:init

# 4a. Carga los datos reales de QQP (ver abajo)...
npm run importar -- "C:\Users\tu_usuario\Downloads\QQP\archivo.csv"
# 4b. ...o carga datos de demostración para probar ya
npm run db:demo

# 5. Enciende la página
npm start
```

Abre **http://localhost:3000** 🎉

> ⚠️ `npm run db:init` crea la base desde cero con `database/schema.sql`, que es tu script `comparador_precios_sostenible_sin_comentarios.sql`. Si la base ya tiene precios no la toca. Para recrearla usa `npm run db:init -- --force`.
> Hay que usar este esquema y no el del dump `proyecto.sql`: en el dump, `ubicacion` es `VARCHAR` (no `POINT`), falta `contrasena_hash` y `distancia_usuario_sucursal` tiene una columna extra `id_usuario_fk NOT NULL`.

## Datos reales de QQP (PROFECO)

1. Descarga el archivo más reciente de *Quién es Quién en los Precios* de los datos abiertos de PROFECO / datos.gob.mx.
2. Descomprime el `.zip`.
3. Importa el archivo o la carpeta completa:

```bash
npm run importar -- ruta/al/archivo.csv
npm run importar -- ruta/a/la/carpeta          # todos los .csv de la carpeta
```

El importador:
- Acepta el CSV **con o sin encabezado**, con este orden de columnas: `PRODUCTO, PRESENTACION, MARCA, CATEGORIA, CATALOGO, PRECIO, FECHAREGISTRO, CADENACOMERCIAL, GIRO, NOMBRECOMERCIAL, DIRECCION, ESTADO, MUNICIPIO, LATITUD, LONGITUD`.
- Detecta solo la codificación (UTF-8 o latin1) y el separador (`,` o `;`).
- Filtra por **coordenadas** dentro del rectángulo de Querétaro y confirma que la columna ESTADO diga Querétaro. Así no se cuelan Celaya o Tula, que caen cerca del límite.
- Filtra la **canasta básica** con la lista de `src/canasta.js`: aceite, arroz, atún, azúcar, res, cebolla, chile, cerdo, frijol, huevo, jabón, jitomate, leche, limón, manzana, naranja, pan de caja, papa, papel higiénico, pasta, pollo, sardina, tortilla, zanahoria, harina de maíz, café, sal, avena, plátano y detergente.
- Interpreta la presentación (`"CAJA 1 LT. ENTERA"` → 1 l, envase CAJA, variante ENTERA) y la dirección (calle, colonia, C.P.).
- Asigna factores de emisión por producto y **borra los datos demo** automáticamente.

Opciones: `--zona=metro` (solo la zona metropolitana), `--solo-coordenadas` (ignora la columna ESTADO), `--todo` (todos los productos, no solo la canasta básica), `--encoding=latin1`.

## Funciones de la página

| | |
|---|---|
| 📍 Ubicación | GPS del celular, municipio o un toque en el mapa (el pin se puede arrastrar) |
| 🚌 Transporte | 6 medios, cada uno con su velocidad, costo y emisiones de CO₂ por km (tabla `medio_transporte`) |
| 🧺 Canasta | Búsqueda sin importar acentos, categorías con íconos, botón "Canasta típica" y opción **"Cualquier marca"** (mismo producto y tamaño, la marca más barata) |
| ⚖️ Prioridad | Ahorrar · Equilibrio · Rapidez · Planeta, más ajuste fino ($ por hora de tu tiempo, $ por kg de CO₂, máximo de tiendas) |
| 🏆 Planes | Recomendado, Más barato, Más rápido, Menor huella, Todo en una tienda, Cada producto a su mínimo |
| 🗺️ Ruta | Tiendas numeradas en el mapa y un botón para abrir la ruta en Google Maps |
| 📊 Comparativa | Las 5 tiendas más baratas de cada producto, con el promedio de la zona |
| 💾 Cuenta | Registro e inicio de sesión. Las listas se guardan en `lista_compra`, `item_lista`, `recomendacion` y `distancia_usuario_sucursal` |

### El motor de recomendación (`src/recomendador.js`)

Evalúa todas las tiendas dentro del radio, una por una. Luego prueba combinaciones de 2 y 3 tiendas entre las mejores y las más baratas de cada producto. Califica cada plan con un **costo generalizado**:

```
productos + transporte + (valor de tu tiempo × horas) + (peso ambiental × kg CO₂) + penalización por productos faltantes
```

- **Distancia:** línea recta × 1.35, porque las calles no son rectas.
- **Ruta:** ida y vuelta, en el orden de visita óptimo.
- **Tiempo:** traslado + espera del transporte + 12 min por tienda.
- **Precios:** el más reciente de cada producto en cada sucursal, de los últimos 120 días (`VENTANA_DIAS` en `.env`).

## Estructura

```
database/schema.sql        Esquema MySQL (el tuyo)
src/server.js              API + página (Express)
src/recomendador.js        Algoritmo de planes de compra
src/canasta.js             Canasta básica, presentaciones, factores de CO₂
src/geo.js                 Municipios, rectángulo de Querétaro, transportes
scripts/init-db.js         Crea la base y los catálogos
scripts/importar-qqp.js    Importador del CSV de PROFECO
scripts/demo-data.js       Datos sintéticos de prueba
public/                    HTML, CSS y JS de la página
test/                      Pruebas (npm test)
```

## Problemas comunes

- **"No hay conexión con MySQL":** revisa que el servicio MySQL esté encendido (en Windows: *Servicios → MySQL80*) y que `DB_PORT=3306`.
- **"Access denied":** la contraseña de root en `.env` no es correcta.
- **El mapa sale gris:** el fondo del mapa se descarga de internet. Revisa tu conexión.
- **No encuentra productos:** aumenta el radio de búsqueda o activa "Cualquier marca".
