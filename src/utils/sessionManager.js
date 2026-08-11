import logger from './logger.js';

/**
 * Gestor de sesiones en memoria para el modo "Sesión de Estudio" (!* ... *!).
 * Acumula mensajes entre el inicio (!*) y el cierre (*!) sin interrumpir la charla.
 */
class SessionManager {
  constructor() {
    this.activeSessions = new Map(); // sessionId -> { messages: [], startedAt: Date }
  }

  /**
   * Inicia una nueva sesión de estudio.
   * @param {string} sessionId - ID único de sesión (ej: "user_default").
   * @param {string} initialText - Texto con el que se abrió la sesión (!* ...).
   */
  startSession(sessionId = 'default', initialText = '') {
    const cleanInitial = initialText.replace(/^!\*/, '').trim();
    const sessionData = {
      sessionId,
      startedAt: new Date().toISOString(),
      messages: cleanInitial ? [cleanInitial] : [],
    };

    this.activeSessions.set(sessionId, sessionData);
    logger.info(`🎬 Sesión de estudio iniciada [${sessionId}]`);
    return sessionData;
  }

  /**
   * Agrega un mensaje a la sesión activa (si existe).
   */
  appendMessage(sessionId = 'default', text) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    // Evitar agregar si el mensaje es el comando de cierre (*!)
    if (text.trim().startsWith('*!')) return true;

    session.messages.push(text);
    logger.debug(`📝 Mensaje agregado a sesión [${sessionId}] (${session.messages.length} mensajes acumulados)`);
    return true;
  }

  /**
   * Verifica si hay una sesión activa.
   */
  hasActiveSession(sessionId = 'default') {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Obtiene la transcripción completa acumulada y cierra la sesión.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  closeSession(sessionId = 'default') {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const fullTranscript = session.messages.join('\n\n---\n\n');
    const messageCount = session.messages.length;

    this.activeSessions.delete(sessionId);
    logger.info(`🏁 Sesión de estudio cerrada [${sessionId}] — ${messageCount} mensajes recopilados`);

    return {
      sessionId,
      startedAt: session.startedAt,
      closedAt: new Date().toISOString(),
      messageCount,
      fullTranscript,
    };
  }

  /**
   * Cancela la sesión activa sin procesar.
   */
  cancelSession(sessionId = 'default') {
    const deleted = this.activeSessions.delete(sessionId);
    if (deleted) logger.info(`❌ Sesión de estudio cancelada [${sessionId}]`);
    return deleted;
  }
}

export const sessionManager = new SessionManager();
