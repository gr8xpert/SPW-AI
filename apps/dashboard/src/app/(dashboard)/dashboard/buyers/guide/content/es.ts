import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// Spanish words of the Buyer Match guide (tone: tú). Icons, groups, links and
// managersOnly come from the English source; button names match buyers/_i18n/es.ts.
export const es: GuideTranslation = {
  what: {
    title: '¿Qué es Contactos?',
    summary: 'Una libreta inteligente para tus compradores y leads que encuentra las casas adecuadas para ellos.',
    blocks: [
      p('Contactos (el complemento Buyer Match) es una libreta para cada persona que quiere comprar (o alquilar) una propiedad contigo, y para los vendedores, arrendadores y demás personas con las que trabajas. Para cada persona apuntas quién es y qué busca.'),
      p('Luego el ordenador hace la parte aburrida. Mira todas las propiedades de tu web y te muestra las que encajan con cada comprador. Tú eliges las mejores y las envías por email con un clic.'),
      p('El comprador recibe una página web privada con esas propiedades. Puede pulsar "me gusta", "no es para mí" o "quiero verla". Tú ves cada clic, así sabes quién está interesado de verdad.'),
      p('También ayuda a tu equipo a no perder ningún lead: quién llamó a quién, quién sigue esperando una llamada y qué visitas están reservadas. El Informe de leads lo muestra todo en una tabla, como la hoja de cálculo que muchas agencias llevaban a mano.'),
      tip('Las personas que rellenan un formulario en tu web o un formulario de leads de Facebook, o que reservan en Calendly, llegan a Nuevos leads (menú de la izquierda). Dale a cada una un rol allí y pasará a tus Contactos. No tienes que escribirlas a mano.'),
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
        ['Contacto', 'Cualquier persona de tu lista: un comprador, vendedor, arrendador, inquilino u otro agente. El "Tipo de contacto" lo indica. En esta guía, "comprador" quiere decir cualquier contacto.'],
        ['Lead', 'Un contacto nuevo al que todavía hay que llamar. El Informe de leads lo sigue hasta que alguien habla con él.'],
        ['Seguimiento', 'Hasta dónde llegó el equipo con un lead: sin contactar, aún sin respuesta, volver a llamar, número equivocado o hablado.'],
        ['Con retraso', 'Un lead al que nadie contactó a tiempo (24 horas, salvo que tu responsable lo cambie). Se pone en rojo.'],
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
    title: 'Añadir un contacto',
    summary: 'A mano, desde tu web, desde anuncios de Facebook, desde Calendly o desde un archivo de Odoo.',
    blocks: [
      terms(
        ['A mano', 'Pulsa "Nuevo contacto", escribe el nombre y el email, y elige el tipo de contacto y el agente. Un email = un comprador, así que no puedes añadir a la misma persona dos veces.'],
        ['Desde tu web', 'Las consultas, el formulario de lista de deseos y "enviarme mis favoritos" crean o actualizan un comprador solos. Las personas nuevas esperan en Nuevos leads.'],
        ['Desde anuncios de Facebook e Instagram', 'Los formularios de leads de tus anuncios llegan cada 15 minutos cuando un responsable los conecta en Ajustes. Las respuestas que encajan con una de tus Preguntas al comprador se rellenan solas.'],
        ['Desde Calendly', 'Cuando alguien reserva en el Calendly de un agente, llega como lead nuevo con la visita ya planificada (mira "Calendario y Calendly").'],
        ['Desde Odoo', 'Los responsables pueden traer a todos sus compradores antiguos con la pestaña Importar.'],
      ),
      p('Los compradores nuevos de la web van a un agente, o se turnan entre agentes ("round-robin"). Un responsable lo elige en Ajustes → General.'),
    ],
  },
  'new-leads': {
    title: 'Nuevos leads',
    summary: 'Todos los que llegaron por su cuenta esperan aquí hasta que les das un rol.',
    linkLabel: 'Abrir Nuevos leads',
    blocks: [
      p('Nuevos leads (menú de la izquierda) es la bandeja de entrada de las personas que te encontraron por su cuenta: un formulario de la web, un formulario de leads de Facebook o Instagram, o una reserva en Calendly. El número rojo te dice cuántas esperan.'),
      steps(
        'Abre Nuevos leads. Cada línea muestra la persona, el formulario que rellenó y su mensaje.',
        'Si quieres, contéstale primero: "Responder" para un email, o el botón de WhatsApp.',
        'Elige un rol (comprador, vendedor, inquilino…) y pulsa "Añadir a Contactos". Pasa a tu lista de Contactos con todo lo que envió.',
      ),
      terms(
        ['Eliminar', 'Solo para spam o pruebas. El lead y sus mensajes desaparecen para siempre.'],
        ['Marcar como atendida', 'Las agencias sin el complemento Buyer Match usan Nuevos leads como una bandeja sencilla: responde y márcala como atendida.'],
      ),
      tip('Los leads nuevos también salen enseguida en el Informe de leads, así que un lead al que nadie llama se pone en rojo allí.'),
      tip("¿Tienes más de un sitio web? Dale a cada uno su propia clave (Ajustes → Claves API). Sus consultas indican de qué sitio vienen y pueden ir al email propio de ese sitio."),
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
        ['WhatsApp', 'Te escribe un mensaje de WhatsApp y abre tu propio WhatsApp (mira "Mensajes de WhatsApp").'],
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
  whatsapp: {
    title: 'Mensajes de WhatsApp',
    summary: 'Un mensaje ya escrito en el idioma del comprador, enviado desde tu propio WhatsApp.',
    blocks: [
      p('El botón verde de WhatsApp (en un comprador, en Nuevos leads, en una visita, en una tarea y en el Informe de leads) te escribe el mensaje en el idioma del comprador. Revísalo, pulsa "Abrir WhatsApp" y envíalo desde tu propio WhatsApp, en el móvil o en el ordenador.'),
      terms(
        ['Propiedades', 'Desde Coincidencias o Sugeridas: las propiedades con enlaces a tu web y a la página del comprador. Los clics se siguen igual que en un email.'],
        ['Responder a una consulta', 'Desde Nuevos leads: una respuesta amable sobre la propiedad por la que preguntó.'],
        ['Visita', 'Desde una visita planificada: el día, la hora, la propiedad y el punto de encuentro con un enlace al mapa.'],
        ['Seguimiento', 'Desde un comprador o una tarea: un mensaje corto de "¿cómo va todo?".'],
        ['Añadir mi enlace de reserva', 'Si tu agencia usa Calendly, añade tu página de reservas para que el comprador elija la hora él mismo.'],
      ),
      p('Cada mensaje que abres cuenta como contacto con el comprador: sale en Actividad y en el Informe de leads.'),
      p('El mensaje termina con el nombre del agente, un enlace de WhatsApp y su email, para que el comprador le contacte con un toque. Salen de Gestión → Agentes (WhatsApp, si no el teléfono; email público, si no el de acceso). Pon también el prefijo de país en el número del agente.'),
      warn('El teléfono necesita el prefijo de país (+34…, +31…). Sin él, WhatsApp no encuentra a la persona; la ventana te avisa.'),
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
        ['Viajes y visitas', 'Añade un viaje cuando el comprador visite la zona y luego añade visitas a ese viaje. El comprador puede recibir un itinerario por email (con un archivo de calendario) o en PDF, y el agente recibe un recordatorio antes de cada visita. El botón de calendario de una visita la añade a Google Calendar o la descarga para Outlook y el iPhone.'],
        ['Tareas', 'Cosas por hacer, como "Llamar el viernes", con una fecha límite y una persona. Las tareas vencidas salen en rojo.'],
        ['Archivos', 'Imágenes y PDF de hasta 20 MB, como una copia del pasaporte o una oferta firmada.'],
        ['Actividad', 'Un diario: llamadas (con cómo fueron), WhatsApps, emails, visitas, visitas a la web y alertas. Usa "Registrar actividad" para añadir una llamada o una reunión.'],
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
      p('"Mi día" es tu página de cada mañana. Muestra tu embudo, los leads a los que nadie llamó a tiempo, las tareas vencidas, las tareas de hoy, las visitas de los próximos 7 días, los compradores de los que esperas respuesta, tus compradores calientes y las alertas por aprobar.'),
      p('"Pendiente hoy" muestra cada tarea que vence hoy (las vencidas primero) y los compradores con los que nadie ha hablado desde hace tiempo.'),
      tip('Activa "Email diario con este resumen" en Mi día y recibirás la misma lista en tu correo cada mañana, con los leads a los que aún no has llamado.'),
    ],
  },
  'lead-report': {
    title: 'Informe de leads',
    summary: 'Cada lead, quién lo llamó y cómo fue. Se rellena solo.',
    linkLabel: 'Abrir el Informe de leads',
    blocks: [
      p('El Informe de leads sustituye a la hoja de cálculo donde los agentes apuntaban "llamado una vez, no contesta". Cada lead es una línea, y el seguimiento sale de lo que el equipo hizo de verdad: llamadas, WhatsApps, emails y visitas.'),
      terms(
        ['Seguimiento', 'Sin contactar (en rojo si va con retraso), aún sin respuesta, volver a llamar, número equivocado o hablado. Debajo: cuántas llamadas, WhatsApps y emails, y cuánto tardó el primer contacto.'],
        ['Registrar llamada', 'Después de una llamada, pulsa "Registrar llamada" y elige cómo fue: contestó, no contesta, llamar más tarde o número equivocado. Añade una nota si quieres.'],
        ['Columnas', 'Entrada, teléfono y email, agente, fase, primer contacto, cita (la próxima visita), última nota, lo que pidieron, presupuesto y tipo de inmueble. La fase y el agente se pueden cambiar en la misma fila.'],
        ['Preguntas al comprador', 'Los responsables pulsan "Columnas" para mostrar algunas de tus Preguntas al comprador (como "¿Cuándo quieres comprar?") como columnas. Los agentes las rellenan en la misma fila; las respuestas de los formularios de Facebook se rellenan solas.'],
        ['Por agente', 'Arriba, una línea por agente: leads, sin contactar, con retraso, contactados, hablado, tiempo hasta el primer contacto, llamadas, WhatsApps, emails, visitas, ganados, perdidos, valor ganado y conversión. Haz clic en un nombre o en un número rojo para filtrar la tabla.'],
        ['Exportar CSV', 'Los responsables pueden descargar toda la tabla para abrirla en Excel.'],
      ),
      tip('Los agentes solo ven sus propios leads y su propia línea. Un lead al que nadie contacta a tiempo también aparece en Mi día y en el email diario del agente.'),
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
  calendar: {
    title: 'Calendario y Calendly',
    summary: 'Tus visitas en Google Calendar, y compradores que reservan la hora ellos mismos.',
    linkLabel: 'Abrir los ajustes de Calendario',
    blocks: [
      p('En Ajustes → Calendario cada usuario tiene un enlace de calendario privado. Añádelo una vez a Google Calendar (Otros calendarios → + → Desde URL), Outlook o tu iPhone, y tus visitas aparecerán allí. El enlace de un agente tiene sus propias visitas; el de un responsable tiene las de todo el equipo, con el nombre del agente en cada título.'),
      warn('Google decide cuándo vuelve a leer el enlace: normalmente en unas horas, a veces en un día. ¿Necesitas una visita ahora mismo? Usa el botón de calendario de esa visita.'),
      p('Calendly es una página de reservas donde el comprador elige un hueco libre en la agenda del agente. Un responsable conecta vuestra cuenta de Calendly una sola vez en Ajustes → Calendario.'),
      terms(
        ['Un comprador reserva', 'Aparece una visita en el contacto correcto con el agente y la hora, y el lead cuenta como hablado en el Informe de leads.'],
        ['Reserva alguien nuevo', 'Llega a Nuevos leads, ya asignado al agente con el que reservó. Sus respuestas de Calendly rellenan tus Preguntas al comprador.'],
        ['Cambio o cancelación', 'La visita pasa a la nueva hora, o se marca como cancelada con el motivo.'],
        ['Enviar el enlace', 'Marca "Añadir mi enlace de reserva" en un mensaje de WhatsApp, o cópialo con el botón de calendario del Informe de leads. El nombre y el email del comprador ya van rellenados.'],
      ),
      tip('Las reservas llegan solas solo con un plan de pago de Calendly (Standard o superior). Con el plan gratuito los enlaces de reserva siguen funcionando, pero la visita la añades tú. Los agentes se asocian por email, así que usa el mismo email en Calendly y aquí.'),
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
        ['General', '¿Pueden los agentes ver los compradores de los demás? ¿Quién recibe los compradores nuevos de la web? ¿Tras cuántos días está "olvidado" un comprador? Recordatorios de visitas, la hora del email diario, la puntuación de caliente, tras cuántas horas se pone en rojo un lead sin llamar, la dirección de los enlaces a propiedades y la dirección de la página del comprador.'],
        ['Etapas', 'Las columnas de tu Tablero. Añade, cambia el nombre, el color, el orden y el % de probabilidad de cada una. Al borrar una etapa te pregunta adónde deben ir sus compradores.'],
        ['Preguntas', 'Tus propias preguntas sobre los compradores. Puedes mostrarlas en el formulario de lista de deseos de la web y como columnas del Informe de leads, y traducirlas. Escribe las opciones igual que en tu formulario de Facebook para que sus respuestas se rellenen solas.'],
        ['Pesos de coincidencia', 'Cuánto cuenta cada deseo en la puntuación, de 0 (nada) a 10 (mucho). Puedes dar a una característica, como las vistas al mar, su propio peso.'],
        ['Alertas y casi coincidencias', 'Activa las alertas, elige "al momento" o "resumen diario" y cuánto debe bajar un precio. Indica cuánto puede pasarse del presupuesto o alejarse una casi coincidencia.'],
        ['Mantenimiento', 'Encuentra posibles duplicados (mismo teléfono o nombre) y fusiónalos. Al fusionar se guarda todo; no se pierde nada.'],
        ['Facebook e Instagram', 'Conecta los formularios de leads de tus anuncios para que los leads nuevos lleguen cada 15 minutos.'],
        ['Calendario', 'El enlace de calendario de cada uno y (responsables) la conexión con Calendly.'],
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
        ['Mi enlace de calendario no muestra visitas.', 'El enlace de un agente solo tiene las visitas en las que él es el agente (mira "Agente:" debajo de la visita). Google puede tardar hasta un día en volver a leer el enlace.'],
        ['No llegó una reserva de Calendly.', 'Ajustes → Calendario debe decir "Las reservas llegan solas" (un plan de pago de Calendly), y el email de Calendly del agente debe ser su email aquí.'],
        ['¿Por qué un lead está en rojo en el Informe de leads?', 'Nadie lo llamó, le escribió por WhatsApp ni le envió un email a tiempo. Registra una llamada (aunque sea "No contesta") y cambia.'],
      ),
      tip('¿Sigues atascado? Abre un ticket en Tickets de soporte y dinos el número del comprador que aparece en la dirección web.'),
    ],
  },
};
