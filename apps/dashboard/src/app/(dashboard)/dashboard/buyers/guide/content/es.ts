import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// Spanish words of the Buyer Match guide (tone: tú). Icons, groups, links and
// managersOnly come from the English source; button names match buyers/_i18n/es.ts.
export const es: GuideTranslation = {
  what: {
    title: '¿Qué es Buyer Match?',
    summary: 'Una libreta inteligente para tus compradores que encuentra las casas adecuadas para ellos.',
    blocks: [
      p('Piensa en Buyer Match como una libreta para cada persona que quiere comprar (o alquilar) una propiedad contigo. Para cada persona apuntas quién es y qué busca.'),
      p('Luego el ordenador hace la parte aburrida. Mira todas las propiedades de tu web y te muestra las que encajan con cada comprador. Tú eliges las mejores y las envías por email con un clic.'),
      p('El comprador recibe una página web privada con esas propiedades. Puede pulsar "me gusta", "no es para mí" o "quiero verla". Tú ves cada clic, así sabes quién está interesado de verdad.'),
      tip('Las personas que rellenan un formulario en tu web llegan a Nuevos leads (menú de la izquierda). Dale a cada una un rol allí y pasará a tus Contactos. No tienes que escribirlas a mano.'),
    ],
  },
  'quick-start': {
    title: 'Inicio rápido en 5 pasos',
    summary: 'El camino más corto de un comprador nuevo a un email enviado.',
    blocks: [
      steps(
        'Ve a la pestaña Contactos y pulsa "Nuevo contacto". Escribe un nombre y un email, y pulsa "Añadir contacto".',
        'Abre el comprador y ve a la pestaña Lista de deseos. Elige qué quiere: alquilar o comprar, los pueblos, el tipo de casa y el presupuesto. Pulsa "Guardar lista de deseos".',
        'Abre la pestaña Coincidencias. Ahora ves todas las propiedades que encajan, las mejores arriba.',
        'Marca las propiedades que te gustan y pulsa "Enviar seleccionadas". Revisa la vista previa del email y pulsa "Enviar email".',
        'Espera la reacción del comprador. Los "me gusta", los rechazos y las peticiones de visita aparecen en el comprador, en Actividad y en "Mi día".',
      ),
      tip('Antes de tu primer email, pide a tu responsable que rellene Ajustes → General → "Enlaces a propiedades en los emails". Sin eso, los emails no pueden enlazar a las páginas de tus propiedades.'),
    ],
  },
  words: {
    title: 'Palabras que verás',
    summary: 'Un pequeño diccionario de las palabras de Buyer Match.',
    blocks: [
      terms(
        ['Comprador', 'Cualquier persona de tu lista. También puede ser un vendedor, un arrendador, un inquilino u otro agente: el "Tipo de contacto" lo indica.'],
        ['Agente', 'La persona de tu equipo que se ocupa de este comprador. Los "Agentes relacionados" son compañeros que ayudan.'],
        ['Etapa', 'Lo avanzado que está el comprador, como "Nuevo", "Visita" o "Ganado". Las etapas son las columnas del Tablero.'],
        ['Lista de deseos', 'Lo que busca el comprador.'],
        ['Imprescindibles', 'Las cuatro cosas que una propiedad debe cumplir: tipo de anuncio, zona, tipo de propiedad y presupuesto.'],
        ['Deseos', 'Extras como dormitorios, tamaño, piscina o vistas al mar. Suben la puntuación, pero nunca ocultan una propiedad.'],
        ['Puntuación', 'Un número que muestra lo bien que encaja una propiedad. Cuanto más alto, mejor.'],
        ['Comprador caliente', 'Alguien muy activo últimamente: "me gusta", peticiones de visita, clics y consultas.'],
        ['Página del comprador', 'Una página web privada para un comprador con todas las propiedades que le enviaste.'],
        ['Alerta', 'Un mensaje que espera tu OK cuando un anuncio nuevo o una bajada de precio encaja con un comprador.'],
      ),
    ],
  },
  list: {
    title: 'La lista de Contactos',
    summary: 'Encuentra cualquier comprador rápido con la búsqueda, los filtros y el orden.',
    linkLabel: 'Abrir la lista de Contactos',
    blocks: [
      p('La pestaña Contactos muestra a todas las personas que puedes ver. Cada tarjeta tiene el nombre, el tipo de contacto, el email, el agente, la etapa, las estrellas y cuándo pasó algo por última vez.'),
      terms(
        ['Buscar', 'Escribe parte de un nombre, un email o un teléfono.'],
        ['Filtros', 'Muestra solo un tipo de contacto, un agente, una etapa, una prioridad, un origen o una respuesta a una de tus preguntas. Pulsa "Borrar" para volver a ver a todos.'],
        ['Compradores calientes', 'Actívalo para ver solo a los compradores más activos.'],
        ['Sin actividad reciente', 'Muestra a los compradores con los que nadie ha hablado desde hace tiempo, para que nadie quede olvidado.'],
        ['Orden', 'Ordena por última actividad, más recientes, nombre o prioridad.'],
        ['Tarjetas / Lista', 'Dos formas de ver los mismos compradores: tarjetas grandes o una tabla compacta.'],
        ['Exportar CSV', 'Los responsables pueden descargar la lista (con tus filtros) para abrirla en Excel.'],
      ),
      tip('Los filtros se quedan en la dirección web. Copia el enlace y un compañero verá exactamente la misma lista.'),
    ],
  },
  'new-buyer': {
    title: 'Añadir un comprador',
    summary: 'A mano, desde tu web, desde anuncios de Facebook o desde un archivo de Odoo.',
    blocks: [
      terms(
        ['A mano', 'Pulsa "Nuevo contacto", escribe el nombre y el email, y elige el tipo de contacto y el agente. Un email = un comprador, así que no puedes añadir a la misma persona dos veces.'],
        ['Desde tu web', 'Las consultas, el formulario de lista de deseos y "enviarme mis favoritos" crean o actualizan un comprador solos.'],
        ['Desde anuncios de Facebook e Instagram', 'Los formularios de leads de tus anuncios llegan cada 15 minutos cuando un responsable los conecta en Ajustes.'],
        ['Desde Odoo', 'Los responsables pueden traer a todos sus compradores antiguos con la pestaña Importar.'],
      ),
      p('Los compradores nuevos de la web van a un agente, o se turnan entre agentes ("round-robin"). Un responsable lo elige en Ajustes → General.'),
    ],
  },
  record: {
    title: 'La ficha de un comprador',
    summary: 'La parte de arriba de la página: tipo, etapa, estrellas, agente, WhatsApp y Privacidad.',
    blocks: [
      p('Haz clic en un comprador para abrir su ficha. La parte de arriba siempre está visible, estés en la pestaña que estés.'),
      terms(
        ['Tipo de contacto', 'Comprador, vendedor, arrendador, inquilino, profesional y más.'],
        ['Etapa', 'En qué punto de tu proceso está el comprador. Cámbiala aquí o arrastra la tarjeta en el Tablero.'],
        ['Estrellas de prioridad', 'Da de 1 a 3 estrellas a los compradores más importantes. Haz clic otra vez en la última estrella encendida para quitar una.'],
        ['Agente y agentes relacionados', 'Quién se ocupa de este comprador y quién más ayuda.'],
        ['WhatsApp', 'Abre un chat de WhatsApp con el teléfono del comprador.'],
        ['Privacidad', 'Consentimiento, baja y borrado. Mira "Privacidad y borrar un comprador" más abajo.'],
        ['Resumen', 'Con la IA activada, tres líneas cortas que te dicen quién es este comprador y qué quiere.'],
      ),
      p('Debajo de la parte de arriba están las pestañas: Datos, Lista de deseos, Coincidencias, Casi coincidencias, Sugeridas, Contactos, Notas internas, Viajes y visitas, Tareas, Archivos, Actividad e Historial.'),
    ],
  },
  details: {
    title: 'Pestaña Datos',
    summary: 'Datos de contacto, foto, tus propias preguntas, documento de identidad y datos de la operación.',
    blocks: [
      terms(
        ['Contacto', 'Nombre, email, teléfonos, idioma, cómo prefiere que le contacten, dirección y una foto. El idioma decide en qué idioma recibe sus emails.'],
        ['Foto', 'Pulsa "Subir foto" (JPG, PNG o WebP) y luego "Guardar" en la tarjeta.'],
        ['Preguntas sobre el comprador', 'Tus propias preguntas, como "¿Es una segunda residencia?". Tu responsable las crea en Ajustes → Preguntas. Puedes filtrar la lista por las respuestas.'],
        ['Identidad y datos legales', 'Tipo y número de documento y el abogado del comprador, para cuando una venta va en serio.'],
        ['Embudo', 'Subestado, el valor de la operación, desde cuándo esperas una respuesta y quién recomendó al comprador (con su %).'],
      ),
      tip('Cada tarjeta tiene su propio botón Guardar. Cambia lo que necesites y pulsa Guardar en esa tarjeta.'),
    ],
  },
  wishlist: {
    title: 'Lista de deseos: lo que quiere el comprador',
    summary: 'Los imprescindibles deciden si una propiedad encaja. Los deseos deciden cuánto.',
    blocks: [
      p('La lista de deseos es el corazón de Buyer Match. Cuanto mejor la rellenes, mejores serán las coincidencias.'),
      terms(
        ['Tipo de anuncio', 'Reventa, obra nueva, alquiler de larga duración o alquiler vacacional.'],
        ['Pueblos o zonas', 'Elige una zona y todos los pueblos que hay dentro cuentan también.'],
        ['Tipos de propiedad', 'Elige "Villa" y todos los tipos de villa cuentan también.'],
        ['Presupuesto', 'Desde y hasta. Una propiedad fuera del presupuesto nunca coincide.'],
        ['Dormitorios, baños, tamaños', 'El mínimo que quiere el comprador.'],
        ['Características y deseos', 'Piscina, vistas al mar, garaje, etc. Suben una propiedad en la lista; nunca la ocultan.'],
        ['Enviar las propiedades que encajan a', 'El comprador, el agente o ambos.'],
      ),
      warn('Los imprescindibles son estrictos. Si eliges solo un pueblo pequeño y un presupuesto bajo, puede que no haya ninguna coincidencia. Amplía un poco la zona o el presupuesto.'),
      tip('Si el comprador vino de una consulta en la web, la lista de deseos puede estar adivinada a partir de la propiedad por la que preguntó. Revísala, cámbiala y pulsa Guardar.'),
    ],
  },
  matched: {
    title: 'Coincidencias y Casi coincidencias',
    summary: 'Las propiedades que encajan, las mejores primero, y las que casi encajan.',
    blocks: [
      p('Coincidencias muestra todas las propiedades de la web que cumplen todos los imprescindibles. La mejor puntuación está arriba. Cada línea te dice qué deseos cumple.'),
      steps(
        'Marca las propiedades que quieras.',
        'Pulsa "Enviar seleccionadas" para enviarlas por email ahora, o "Añadir a Sugeridas" para guardarlas para más tarde.',
      ),
      p('Las propiedades que ya enviaste, o que el comprador rechazó, se ocultan para que nada salga dos veces. Pulsa "Mostrar todas" para verlas otra vez.'),
      p('Las Casi coincidencias son propiedades que fallan un solo imprescindible por poco: por ejemplo un 5% por encima del presupuesto, o en el pueblo de al lado. Cada una dice por qué falla. Un responsable decide cuánto es "poco".'),
    ],
  },
  suggested: {
    title: 'Propiedades sugeridas',
    summary: 'Tu selección hecha a mano para este comprador.',
    blocks: [
      p('Sugeridas es tu selección. Añade propiedades desde Coincidencias, o escribe una referencia como R1234567 y pulsa "Añadir".'),
      terms(
        ['Estado', 'Sugerida, enviada, visitada, interesado o no interesado.'],
        ['Nota', 'Una nota privada. Solo la ve tu equipo.'],
        ['Enlace de visita virtual', 'Un enlace a un vídeo o tour para enviar junto con la propiedad.'],
        ['Fecha de visita', 'Cuándo la verá el comprador.'],
        ['Descargar PDF', 'Un PDF limpio de la selección (o solo de las marcadas) para imprimir o adjuntar.'],
        ['Cronología', 'Para cada propiedad enviada: enviada, abierta, clic, le gustó, no es para mí, visita, oferta.'],
      ),
      tip('Puedes marcar tú mismo lo que pasó, por ejemplo "Visita" u "Oferta", cuando el comprador te lo dijo por teléfono.'),
    ],
  },
  sending: {
    title: 'Enviar propiedades por email',
    summary: 'Un email con tu marca en el idioma del comprador, con su página privada.',
    blocks: [
      steps(
        'Selecciona propiedades en Coincidencias o Sugeridas y pulsa "Enviar seleccionadas".',
        'Elige quién lo recibe: el comprador, el agente o ambos.',
        'Elige el idioma y añade un mensaje personal si quieres ("Escribir con IA" puede escribirlo por ti).',
        'Mira la vista previa y pulsa "Enviar email".',
      ),
      p('Cada email tiene un enlace a la página privada del comprador. En esa página puede darle "me gusta" a una propiedad, decir "no es para mí" (con un motivo) o pedir verla. Recibes un email cuando lo hace.'),
      p('Puedes desactivar la página, crear un enlace nuevo (el antiguo deja de funcionar) o copiar el enlace desde la tarjeta "Página del comprador".'),
      warn('"Abierta" no siempre es cierto: algunas apps de correo abren las imágenes solas. Un clic o un "me gusta" es una señal mucho mejor.'),
    ],
  },
  ai: {
    title: 'Ayudas con IA',
    summary: 'Deja que la IA lea mensajes, escriba notas y encuentre patrones. Tú siempre lo revisas antes.',
    blocks: [
      p('Las ayudas con IA usan la clave de IA (OpenRouter o Anthropic) de tu propia agencia (Ajustes → IA). Nada de lo que propone la IA se guarda hasta que pulsas Guardar.'),
      terms(
        ['Pegar un mensaje', 'Pega un email o un mensaje de WhatsApp del comprador. La IA lee lo que quiere y propone cambios en la lista de deseos.'],
        ['Nota de voz', 'Habla hasta 30 segundos después de una llamada. La IA escribe la nota por ti. La grabación no se guarda.'],
        ['Reglas de las notas', 'Escribe en Notas internas lo que el comprador exige o rechaza ("nada de planta baja"). La IA lo convierte en reglas. Una propiedad que rompe una regla recibe menos puntuación y un aviso; nunca se oculta.'],
        ['Resumen', 'Tres líneas cortas sobre el comprador en la parte de arriba de la ficha.'],
        ['Qué dicen las opiniones', 'Tras unos cuantos "me gusta" y rechazos, la IA muestra patrones, como "rechazó 4 plantas bajas", y te ofrece añadir una regla.'],
        ['Escribir con IA', 'Una frase de inicio corta y amable para tu email.'],
      ),
      tip('Las reglas "Obligatorio" bajan 40 puntos a una propiedad que las rompe; las reglas "Preferible", 15.'),
    ],
  },
  'more-tabs': {
    title: 'Notas, viajes, tareas, archivos e historial',
    summary: 'Todo lo demás que guardas sobre un comprador.',
    blocks: [
      terms(
        ['Contactos', 'Otras personas implicadas: una pareja, un familiar o un asistente, con su teléfono y su email.'],
        ['Notas internas', 'Notas libres que solo ve tu equipo. La IA puede leerlas para crear reglas.'],
        ['Viajes y visitas', 'Añade un viaje cuando el comprador visite la zona y luego añade visitas a ese viaje. El comprador puede recibir un itinerario por email o en PDF, y el agente recibe un recordatorio antes de cada visita.'],
        ['Tareas', 'Cosas por hacer, como "Llamar el viernes", con una fecha límite y una persona. Las tareas vencidas salen en rojo.'],
        ['Archivos', 'Imágenes y PDF de hasta 20 MB, como una copia del pasaporte o una oferta firmada.'],
        ['Actividad', 'Un diario: llamadas, emails, visitas, visitas a la web y alertas. Usa "Registrar actividad" para añadir una llamada o una reunión.'],
        ['Historial', 'Cada cambio en el comprador: quién cambió qué y cuándo. Nada es un misterio.'],
      ),
      tip('Después de una visita, márcala como "Hecha" y escribe la opinión del comprador. Ayuda al siguiente agente y a la IA.'),
    ],
  },
  'my-day': {
    title: 'Mi día y Pendiente hoy',
    summary: 'Ábrelos primero cada mañana.',
    linkLabel: 'Abrir Mi día',
    blocks: [
      p('"Mi día" es tu página de cada mañana. Muestra tu embudo, las tareas vencidas, las tareas de hoy, las visitas de los próximos 7 días, los compradores de los que esperas respuesta, tus compradores calientes y las alertas por aprobar.'),
      p('"Pendiente hoy" muestra cada tarea que vence hoy (las vencidas primero) y los compradores con los que nadie ha hablado desde hace tiempo.'),
      tip('Activa "Email diario con este resumen" en Mi día y recibirás la misma lista en tu correo cada mañana.'),
    ],
  },
  board: {
    title: 'El Tablero',
    summary: 'Ve a todos los compradores como tarjetas en columnas, una columna por etapa.',
    linkLabel: 'Abrir el Tablero',
    blocks: [
      p('El Tablero es como notas adhesivas en una pared. Cada columna es una etapa. Arrastra un comprador de una columna a la siguiente cuando avance.'),
      p('Los filtros también funcionan aquí, así que puedes ver solo tus compradores o solo los calientes.'),
    ],
  },
  alerts: {
    title: 'Alertas: anuncios nuevos y bajadas de precio',
    summary: 'El sistema encuentra coincidencias nuevas por ti. Tú dices sí o no.',
    linkLabel: 'Abrir Alertas',
    blocks: [
      p('Cuando entra una propiedad nueva, o baja un precio, el sistema revisa a todos los compradores. Si encaja con alguien, una alerta te espera en la pestaña Alertas. El número rojo de la pestaña te dice cuántas hay.'),
      steps(
        'Abre Alertas. Cada línea muestra el comprador, la propiedad y la puntuación.',
        'Pulsa "Aprobar" en las buenas y "Rechazar" en el resto. "Aprobar las…" lo hace con todas a la vez.',
        'Las alertas aprobadas se envían, al momento o en un email diario por comprador (lo elige tu responsable).',
      ),
      warn('No se envía nada sin tu OK. Si nunca apruebas, los compradores nunca reciben alertas.'),
    ],
  },
  reverse: {
    title: 'Compradores para esta propiedad',
    summary: 'Empieza por una propiedad y encuentra a todos los compradores a los que les gustaría.',
    blocks: [
      p('Abre una propiedad en Propiedades. La tarjeta "Compradores para esta propiedad" cuenta a todos los compradores cuya lista de deseos encaja con ella.'),
      p('Pulsa "Ver compradores" para ver quiénes son, y luego "Enviar a todos" o envía a los que marques. Los compradores que ya la recibieron, o la rechazaron, se saltan.'),
      tip('Ideal para un anuncio nuevo o una bajada de precio que quieres mover rápido.'),
    ],
  },
  reports: {
    title: 'Embudo e ingresos',
    summary: 'Cómo va la agencia, en números y gráficos.',
    linkLabel: 'Abrir Embudo e ingresos',
    blocks: [
      terms(
        ['Nuevos compradores', 'Cuántos llegaron, por mes y por origen (web, teléfono, Facebook…).'],
        ['Ganados y perdidos', 'Cuántos compradores compraron y cuántos perdiste.'],
        ['Valor abierto del embudo', 'El valor total de las operaciones de los compradores que siguen en curso.'],
        ['Ingresos previstos', 'Los valores de las operaciones multiplicados por la probabilidad de cada etapa. Una estimación razonable de lo que viene.'],
        ['Embudo por etapas', 'Cuántos compradores nuevos llegaron a cada etapa.'],
        ['Por agente', 'Leads, seguimiento, ventas, valor ganado y conversión por agente están en el Informe de leads.'],
      ),
    ],
  },
  settings: {
    title: 'Ajustes',
    summary: 'Cómo funciona Buyer Match para toda tu agencia.',
    linkLabel: 'Abrir Ajustes',
    blocks: [
      p('Solo el dueño de la agencia o un responsable puede cambiarlos. Los agentes pueden verlos.'),
      terms(
        ['General', '¿Pueden los agentes ver los compradores de los demás? ¿Quién recibe los compradores nuevos de la web? ¿Tras cuántos días está "olvidado" un comprador? Recordatorios de visitas, la hora del email diario, la puntuación de caliente, la dirección de los enlaces a propiedades y la dirección de la página del comprador.'],
        ['Etapas', 'Las columnas de tu Tablero. Añade, cambia el nombre, el color, el orden y el % de probabilidad de cada una. Al borrar una etapa te pregunta adónde deben ir sus compradores.'],
        ['Preguntas', 'Tus propias preguntas sobre los compradores. También puedes mostrarlas en el formulario de lista de deseos de la web y traducirlas.'],
        ['Pesos de coincidencia', 'Cuánto cuenta cada deseo en la puntuación, de 0 (nada) a 10 (mucho). Puedes dar a una característica, como las vistas al mar, su propio peso.'],
        ['Alertas y casi coincidencias', 'Activa las alertas, elige "al momento" o "resumen diario" y cuánto debe bajar un precio. Indica cuánto puede pasarse del presupuesto o alejarse una casi coincidencia.'],
        ['Mantenimiento', 'Encuentra posibles duplicados (mismo teléfono o nombre) y fusiónalos. Al fusionar se guarda todo; no se pierde nada.'],
        ['Facebook e Instagram', 'Conecta los formularios de leads de tus anuncios para que los leads nuevos se conviertan en compradores cada 15 minutos.'],
      ),
      warn('Rellena primero "Enlaces a propiedades en los emails". Sin eso, los emails no pueden enlazar a las páginas de tus propiedades.'),
    ],
  },
  import: {
    title: 'Importar desde Odoo',
    summary: 'Trae a tus compradores antiguos desde un archivo exportado de Odoo.',
    linkLabel: 'Abrir Importar',
    blocks: [
      steps(
        'En Odoo, exporta tus compradores como archivo .xlsx.',
        'En la pestaña Importar elige el archivo y pulsa "Revisar el archivo". Todavía no se guarda nada.',
        'Mira "Qué va a pasar": compradores nuevos, compradores actualizados y valores que no coincidieron.',
        'Para cada valor que no coincidió (un agente, un pueblo…), elige qué significa en SPM, o deja "Guardar como nota".',
        'Pulsa "Importar". Importar el mismo archivo otra vez actualiza los mismos compradores; nunca crea copias.',
      ),
    ],
  },
  privacy: {
    title: 'Privacidad y borrar un comprador',
    summary: 'Consentimiento, baja y borrado de datos personales (RGPD).',
    blocks: [
      p('Cada comprador tiene un botón Privacidad en la parte de arriba de su ficha.'),
      terms(
        ['Registrar consentimiento', 'Apunta que el comprador aceptó que le contacten, y cómo (web, teléfono, en persona…).'],
        ['Darse de baja de los emails de propiedades', 'El comprador ya no recibe emails de propiedades ni alertas. Su agente sí puede seguir escribiéndole. El comprador también puede hacerlo desde el enlace de cualquier email.'],
        ['Borrar datos personales', 'Para responsables. Elimina para siempre el nombre, el email, los teléfonos, la dirección, el documento, las notas, los archivos y las respuestas, y el comprador desaparece de tus listas. Solo quedan números anónimos para Embudo e ingresos.'],
      ),
      steps(
        'Abre el comprador y pulsa "Privacidad".',
        'Elige "Borrar datos personales…".',
        'Escribe ERASE en mayúsculas y pulsa "Borrar para siempre".',
      ),
      warn('El borrado no se puede deshacer. Si el comprador solo es un duplicado, fusiónalo en Ajustes → Mantenimiento.'),
    ],
  },
  'who-sees': {
    title: 'Quién puede ver y hacer qué',
    summary: 'Agentes, responsables y dueños.',
    blocks: [
      terms(
        ['Agentes', 'Ven sus propios compradores (o a todos, si el responsable lo permite). Pueden añadir compradores, rellenar listas de deseos, enviar emails, aprobar alertas y añadir tareas.'],
        ['Responsables y dueños', 'Ven a todos los compradores y además tienen Embudo e ingresos, Importar, Exportar CSV, fusionar, borrar y los Ajustes.'],
      ),
      p('Las personas que solo aparecen en la web o en Buyer Match, sin acceso al panel, se gestionan en Agentes (menú de la izquierda).'),
    ],
  },
  faq: {
    title: 'Preguntas frecuentes',
    summary: 'Respuestas rápidas a las preguntas que más oímos.',
    blocks: [
      terms(
        ['¿Por qué Coincidencias no muestra nada?', 'Los imprescindibles son demasiado estrictos. Elige una zona más grande, más tipos de propiedad o un presupuesto más amplio.'],
        ['¿Por qué falta en Coincidencias una propiedad que envié?', 'Las propiedades enviadas y rechazadas se ocultan para que nadie las reciba dos veces. Pulsa "Mostrar todas".'],
        ['El email no tiene enlaces a mi web.', 'Un responsable debe rellenar Ajustes → General → "Enlaces a propiedades en los emails".'],
        ['Los botones de IA dicen que necesito una clave.', 'Añade tu clave de IA (OpenRouter o Anthropic) en Ajustes → IA (dueño o responsable).'],
        ['Añadí a la misma persona dos veces.', 'Usa Ajustes → Mantenimiento → Posibles duplicados y fusiónalos.'],
        ['¿Cómo elimino un comprador?', 'Privacidad → Borrar datos personales (responsables). El comprador sale de tus listas para siempre.'],
        ['Un comprador dice que recibe demasiados emails.', 'Privacidad → Darse de baja de los emails de propiedades.'],
      ),
      tip('¿Sigues atascado? Abre un ticket en Tickets de soporte y dinos el número del comprador que aparece en la dirección web.'),
    ],
  },
};
