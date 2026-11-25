# Calaos

Trae a Gladys las habitaciones y las IO de su servidor domótico [Calaos](https://calaos.fr): luces,
reguladores, luces de color, persianas, sensores, interruptores de pared, variables internas y
escenarios. Gladys habla con `calaos_server` en su red local, mediante la API JSON que usan las
aplicaciones Calaos, y recibe cada cambio en directo.

Probada contra un `calaos_server` 4.8.3 real, con IO simuladas, no en una instalación con hardware
Wago, KNX o 1-Wire real: sus comentarios son bienvenidos en el foro.

## Requisitos

- Un servidor Calaos (Calaos OS, o el contenedor `calaos_base`) accesible desde la máquina de
  Gladys.
- El nombre de usuario y la contraseña de las aplicaciones Calaos (Calaos Home, la aplicación web).
- Gladys 5.1 o posterior.

## Configuración

### Dirección

La dirección IP del servidor Calaos, vista desde Gladys: `192.168.1.20`. Se añade el puerto 5454
si no indica ninguno; si no, indique `192.168.1.20:5454` o `http://192.168.1.20:5454`. Use el
puerto del propio `calaos_server`, no el puerto HTTPS de la aplicación web: Gladys no acepta el
certificado autofirmado de una caja Calaos.

### Nombre de usuario y contraseña

Los de las aplicaciones Calaos. Tras una contraseña incorrecta, Calaos frena durante un tiempo cada
nuevo intento de la misma dirección (hasta un minuto): Gladys vuelve a intentarlo unos segundos
después, y luego cada minuto.

### Elegir qué importar

Cada IO de cada habitación se ofrece en la pestaña **Descubrir** de la integración: añada las que
quiera. **Solo las IO de estas habitaciones** conserva las habitaciones que indique (nombres de
habitaciones de Calaos, separados por comas).

Las IO ocultas en las aplicaciones Calaos (variables internas, salidas técnicas) solo se ofrecen
con **Ofrecer también las IO ocultas**. Los interruptores y botones de pared siempre se ofrecen, ya
que Calaos los oculta por defecto.

### Idioma

**Idioma de los nombres de funciones** elige el idioma de los nombres que Gladys da a las funciones
(Encendido/apagado, Brillo…), al añadir el dispositivo.

## Lo que obtiene

### Dispositivos

Un dispositivo de Gladys por IO de Calaos, con el nombre de la IO y de su habitación:

| IO de Calaos                              | En Gladys                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Luz                                       | luz, encendido/apagado                                            |
| Regulador                                 | luz, encendido/apagado y brillo                                   |
| Luz de color (RGB)                        | luz, encendido/apagado y color                                    |
| Persiana                                  | persiana, abrir / parar / cerrar                                  |
| Persiana inteligente                      | persiana, abrir / parar / cerrar y posición (100 % = abierta)     |
| Temperatura                               | sensor de temperatura (°C)                                        |
| Entrada analógica                         | el sensor de su estilo o unidad: humedad, presión, lux, W…        |
| Interruptor, puerta, movimiento, humo…    | entrada, o el detector de su estilo (apertura, movimiento, fuga…) |
| Interruptores de pulsación larga y triple | botón: clic, clic largo, doble y triple clic                      |
| Booleano interno                          | interruptor                                                       |
| Texto interno, entrada de texto           | texto                                                             |
| Escenario                                 | pulsador que lo inicia                                            |

No se importan: salidas analógicas, números internos, franjas horarias, temporizadores, cámaras,
reproductores de audio y amplificadores. **Probar la conexión** indica lo que se dejó de lado. Una
entrada analógica con una unidad que Gladys no conoce (o un porcentaje sin el estilo humedad)
también se deja de lado: elija su estilo en Calaos Installer.

Los estados llegan en directo, unas centésimas de segundo después del cambio. Las medidas se envían
como mucho cada 10 segundos, la posición de una persiana inteligente en movimiento cada 2 segundos.

### Widget del panel

**Calaos**: la conexión, la versión de Calaos, actualizaciones en directo o por consulta, las IO
ofrecidas y añadidas, y un botón para volver a leer la lista de IO (se puede ocultar en los
ajustes del widget).

### Disparador de escena

**IO de Calaos modificada**: una IO cambió en Calaos, aunque no esté añadida a Gladys (un botón,
un escenario, una variable interna). Filtre por el nombre de la IO y el nuevo valor; las variables
dan el identificador, el nombre, la habitación, el valor nuevo y el anterior. Las temperaturas y
las entradas analógicas no lo activan (use su dispositivo), ni las posiciones intermedias de una
persiana inteligente en movimiento.

### Acciones de escena

- **Iniciar un escenario de Calaos**, por su nombre, aunque no esté añadido a Gladys.
- **Enviar un valor a una IO de Calaos**, como lo hacen las reglas de Calaos: `true`, `false`,
  `toggle`, `set 50`, `up`, `down`, `stop`, `impulse 500`, `set #FF8000`… La IO es su nombre, o su
  identificador cuando dos IO tienen el mismo nombre (el mensaje de error da los identificadores).

## Ejemplos de escenas

- Cuando se pulsa largo el botón «Puerta de entrada», iniciar el escenario de Calaos «Salida».
- Cuando Gladys ya no detecta a nadie en casa, enviar `true` a la variable interna «Modo ausencia»
  que usan sus reglas de Calaos.
- Cuando la IO de Calaos «Timbre» pasa a `true`, enviar un mensaje de Telegram.

## Solución de problemas

- **Calaos no responde**: compruebe la dirección y el puerto (5454) desde la máquina de Gladys, y
  que `calaos_server` esté en marcha.
- **Inicio de sesión rechazado**: compruebe el nombre de usuario y la contraseña en las
  aplicaciones Calaos. Tras varios fallos, espere un minuto.
- **Actualizaciones: cada 30 s** en el widget: el WebSocket de Calaos es rechazado (un proxy
  intermedio que no lo deja pasar). Gladys lee los estados por HTTP cada 30 segundos y vuelve a
  intentar el WebSocket con regularidad.
- **Falta una IO**: está oculta en Calaos (vea la opción), fuera de las habitaciones elegidas, o es
  de un tipo no importado (**Probar la conexión** las indica).

## Límites

- Ni termostato, ni reproductor de audio, ni cámara, ni amplificador.
- Un interruptor de puerta o ventana se lee como abierto cuando Calaos dice `true`.
- Una persiana simple no tiene posición: su estado pasa a cerrada al final de su tiempo de
  recorrido.
- Los comandos pasan por `set_state`: Calaos los acepta o los rechaza, sin decir por qué.

## Privacidad

Todo se queda en su red local: Gladys solo habla con su servidor Calaos. La contraseña la guarda
Gladys y nunca se escribe en los registros.
