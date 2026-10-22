import type { SharedText } from './en';

const loc = (n: number) => (n === 1 ? 'ubicación' : 'ubicaciones');
const typ = (n: number) => (n === 1 ? 'tipo de propiedad' : 'tipos de propiedad');

export const es: SharedText = {
  bulkSeo: {
    button: 'SEO masivo',
    running: (progress) => `SEO ${progress}%`,
    title: 'Generar SEO con IA',
    description:
      'Rellena el título de página, el meta título, la meta descripción y las palabras clave de todo tu catálogo. Se ejecuta en segundo plano con tu crédito de IA.',
    languages: 'Idiomas',
    overwrite: 'Sobrescribir el SEO existente',
    overwriteHelp:
      'Desactivado: las propiedades que ya tienen SEO en un idioma se omiten y no cuestan nada. Activado: se regenera todo, incluido lo escrito a mano.',
    schema: 'Generar esquema JSON-LD',
    schemaHelp:
      'Añade una llamada de IA extra por propiedad. Solo hace falta si quieres un esquema propio en lugar del que se crea automáticamente con los campos de la propiedad.',
    slug: 'Rellenar slugs vacíos',
    slugHelp: 'Solo escribe un slug donde no lo hay. Los slugs existentes son URL activas y nunca se reescriben.',
    counting: 'Contando propiedades…',
    estimate: (properties) => `{properties} ${properties === 1 ? 'propiedad' : 'propiedades'} · hasta {calls} llamadas de IA`,
    fewerInPractice: '— menos en la práctica, porque se omiten las propiedades que ya tienen SEO',
    cancel: 'Cancelar',
    start: 'Iniciar',
    pickLanguage: 'Elige al menos un idioma',
    finishedWithErrors: 'SEO masivo terminado con errores',
    complete: 'SEO masivo completado',
    summary: (generated, skipped, failed, total) =>
      `${generated} generadas, ${skipped} ya tenían SEO, ${failed} fallidas de ${total}.`,
    alreadyRunning: 'El SEO masivo ya está en marcha',
    alreadyRunningText: 'Se muestra el progreso de la ejecución en curso; no se ha iniciado una segunda.',
    started: 'SEO masivo iniciado',
    startedText: 'Se ejecuta en segundo plano. Puedes salir de esta página; el progreso aparece en el botón.',
    startFailed: 'No se pudo iniciar el SEO masivo',
    noJobId: 'No se recibió el ID de la tarea',
    unexpectedError: 'Error inesperado',
  },
  setupTransfer: {
    button: 'Copiar configuración',
    menuHelp: (kind) =>
      kind === 'locations'
        ? 'Copia esta organización de ubicaciones a otro cliente. Solo cambian las ubicaciones que tienen ambos clientes; no se añade ni se elimina nada.'
        : 'Copia esta organización de tipos de propiedad a otro cliente. Solo cambian los tipos que tienen ambos clientes; no se añade ni se elimina nada.',
    export: 'Exportar configuración',
    import: 'Importar configuración…',
    exported: 'Configuración exportada',
    exportedText: (n, kind) =>
      `${n === 1 ? 'Se ha guardado' : 'Se han guardado'} ${n} ${kind === 'locations' ? loc(n) : typ(n)}. Importa el archivo en el panel del otro cliente.`,
    exportFailed: 'No se pudo exportar',
    tryAgain: 'Inténtalo de nuevo.',
    readFailed: 'No se pudo leer el archivo',
    imported: 'Configuración importada',
    importedText: (changed, merged, kind) =>
      `${changed === 1 ? 'Se ha actualizado' : 'Se han actualizado'} ${changed} ${kind === 'locations' ? loc(changed) : typ(changed)}${
        merged ? ` y se han fusionado ${merged} ${merged === 1 ? 'duplicado' : 'duplicados'}` : ''
      }. Tu web usa la nueva configuración.`,
    importFailed: 'No se pudo importar',
    dialogTitle: (kind) =>
      kind === 'locations' ? 'Importar configuración de ubicaciones' : 'Importar configuración de tipos de propiedad',
    found: (matched, total, changed, kind) =>
      `Se encontraron en el archivo ${matched} de tus ${total} ${kind === 'locations' ? 'ubicaciones' : 'tipos de propiedad'}${
        changed > 0 ? `; ${changed} cambiarán.` : ' y ya coinciden con él.'
      }`,
    untouched: (n, kind) =>
      `${n} de tus ${kind === 'locations' ? 'ubicaciones' : 'tipos de propiedad'} no ${n === 1 ? 'está' : 'están'} en el archivo y se ${n === 1 ? 'queda' : 'quedan'} como ${n === 1 ? 'está' : 'están'}.`,
    notInAccount: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} del archivo no ${n === 1 ? 'existe' : 'existen'} en esta cuenta y no se ${n === 1 ? 'añadirá' : 'añadirán'}`,
    example: (list) => `(p. ej. ${list})`,
    rows: {
      moved: 'Movidos a otro elemento superior',
      renamed: 'Renombrados',
      reordered: 'Nuevo orden',
      aliases: 'Otras grafías copiadas',
      coords: 'Puntos del mapa copiados',
      merged: 'Duplicados fusionados en uno',
      keptInPlace: 'Se quedan bajo su superior actual (el superior del archivo no está en esta cuenta)',
      clashes: 'No movidos (ya hay uno con el mismo nombre)',
      ambiguous: 'Omitidos (más de una coincidencia posible)',
    },
    cancel: 'Cancelar',
    apply: 'Aplicar',
  },
  sortOrder: {
    button: 'Ordenar',
    help: 'Sustituye el orden actual en todos los niveles. Arrastra filas para ajustarlo. Tu web usa este orden.',
    options: { name: 'De la A a la Z', 'name-desc': 'De la Z a la A', count: 'Más anuncios primero' },
    sorted: (label) => `Ordenado: ${label}`,
    sortedText: 'Tu web muestra el nuevo orden.',
    failed: 'No se pudo ordenar',
    failedText: 'No se ha cambiado nada. Inténtalo de nuevo.',
  },
  locked: {
    title: (feature) => `${feature} está bloqueado`,
    description: (feature) =>
      `${feature} está disponible como complemento de pago. Contacta con tu gestor de cuenta para activarlo para este cliente.`,
    viewPlans: 'Ver planes',
    backToDashboard: 'Volver al panel',
    checkFailed: 'No se pudo comprobar tu plan.',
    tryAgain: 'Reintentar',
  },
  photo: {
    chooseImage: 'Elige una imagen',
    chooseImageText: 'La foto debe ser un archivo JPG, PNG o WebP.',
    uploadFailed: 'Error al subir la foto',
    noAddress: 'La subida no devolvió ninguna dirección.',
    uploading: 'Subiendo…',
    change: 'Cambiar foto',
    upload: 'Subir foto',
    remove: 'Quitar foto',
    formats: 'JPG, PNG o WebP',
  },
  weeklyReport: {
    title: 'Informe semanal',
    description:
      'Cada lunes por la mañana: las visitas a propiedades, búsquedas y consultas de la semana pasada, las propiedades más vistas, lo que importó tu feed y todo lo de tu web que necesita atención.',
    enabled: 'Enviar el informe semanal',
    sendTo: 'Enviarlo a',
    remove: (email) => `Quitar ${email}`,
    defaultRecipients: 'Los administradores de tu cuenta (añade direcciones para elegir tú)',
    emailPlaceholder: 'nombre@agencia.com',
    add: 'Añadir',
    save: 'Guardar',
    preview: 'Ver el informe de esta semana',
    sendToMe: 'Enviármelo ahora',
    notEmail: 'Eso no es una dirección de email',
    saved: 'Ajustes del informe semanal guardados',
    saveFailed: 'No se pudo guardar',
    previewFailed: 'No se pudo crear la vista previa',
    sent: 'Informe enviado',
    sentText: (to) => (to ? `Revisa ${to}.` : 'Revisa tu bandeja de entrada.'),
    sendFailed: 'No se pudo enviar',
    to: (list) => `Para: ${list}`,
    nobody: 'nadie todavía — añade una dirección',
    frameTitle: 'Vista previa del informe semanal',
  },
  impersonation: {
    session: 'Sesión de superadmin ·',
    viewingAs: 'Viendo como',
    returnToAdmin: 'Volver a admin',
    returned: 'De vuelta en admin',
    returnedText: 'Has vuelto a tu sesión de superadmin.',
  },
};
