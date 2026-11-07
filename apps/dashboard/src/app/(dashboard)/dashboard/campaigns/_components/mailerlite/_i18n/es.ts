import type { MailerLiteText } from './en';

export const es: MailerLiteText = {
  title: 'MailerLite',
  description: 'Mantén tus contactos y etiquetas al día en tu propia cuenta de MailerLite.',
  intro: 'Conecta tu propia cuenta de MailerLite y copiamos allí tus contactos y sus etiquetas. Diseñas y envías tus correos en MailerLite. Si alguien se da de baja, rebota o marca spam allí, también queda dado de baja aquí.',
  connect: {
    keyLabel: 'Clave API de MailerLite',
    keyPlaceholder: 'Pega aquí tu clave API',
    whereTitle: '¿Dónde encuentro mi clave?',
    whereSteps: 'En MailerLite, abre Integrations, elige MailerLite API y haz clic en Generate new token. Copia el token y pégalo aquí.',
    button: 'Conectar',
    connecting: 'Comprobando tu clave…',
  },
  errors: {
    BAD_KEY: 'MailerLite no ha aceptado esta clave API. Revísala e inténtalo de nuevo.',
    MAILERLITE_BUSY: 'MailerLite está ocupado. Inténtalo de nuevo en un minuto.',
    generic: 'No hemos podido contactar con MailerLite. Inténtalo de nuevo en unos minutos.',
    loadFailed: 'No hemos podido cargar tus ajustes de MailerLite. Solo los responsables pueden verlos.',
    actionFailed: 'No ha funcionado. Inténtalo de nuevo.',
  },
  consent: {
    title: 'Una cosa antes de la primera sincronización',
    checkbox: 'Confirmo que estos contactos aceptaron recibir correos de marketing',
    help: 'Solo se copian las personas suscritas aquí. Las direcciones dadas de baja o que han rebotado quedan fuera.',
    button: 'Confirmar e iniciar la primera sincronización',
  },
  connected: {
    badge: 'Conectado',
    keyEnding: (last4: string) => `Clave API que termina en ${last4}`,
    consentBy: (who: string, when: string) => `Consentimiento confirmado por ${who} el ${when}`,
    lastSync: 'Última sincronización',
    never: 'Todavía no',
    syncing: 'Sincronizando. Una lista grande puede tardar unas horas; puedes salir de esta página.',
    syncNow: 'Sincronizar ahora',
    disconnect: 'Desconectar',
    daily: 'Tus contactos también se sincronizan solos una vez al día.',
    groups: 'Todos entran en un grupo llamado "SPM contacts" y cada etiqueta tiene su propio grupo que empieza por "SPM:". Si quitas una etiqueta aquí, la persona sale de ese grupo en MailerLite. Tus otros grupos no se tocan.',
    statsNote: 'Las aperturas, los clics y otros resultados de los correos que envías desde MailerLite aparecen en MailerLite, no aquí.',
  },
  counts: {
    added: 'Añadidos',
    updated: 'Actualizados',
    unchanged: 'Ya al día',
    skipped: 'Excluidos',
    failed: 'No se pudieron enviar',
    skippedHelp: 'Excluidos: personas sin una dirección de correo real y personas dadas de baja o con rebote.',
  },
  notices: {
    bad_key: 'MailerLite ya no acepta tu clave API. Vuelve a conectar con una clave nueva.',
    unreachable: 'La última sincronización no pudo terminar porque no se pudo contactar con MailerLite. La próxima vez continuará donde se detuvo.',
    some_groups_missing: 'Algunas etiquetas no tienen grupo en MailerLite porque no se pudo crear. Puede que tu cuenta haya alcanzado su límite de grupos.',
  },
  attention: {
    badge: 'Requiere atención',
    newKey: 'Conectar con una clave nueva',
  },
  disconnect: {
    title: '¿Desconectar MailerLite?',
    body: 'La sincronización se detiene y las bajas dejan de llegar desde MailerLite. Tus contactos y grupos se quedan en tu cuenta de MailerLite.',
    cancel: 'Cancelar',
    confirm: 'Desconectar',
  },
};
