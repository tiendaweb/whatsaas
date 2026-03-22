import type { LandingContentRecord } from '@/lib/landing/types';

export const defaultLandingContent: LandingContentRecord = {
  homeSections: [
    {
      id: 'section-automation',
      eyebrow: 'Automatización visible',
      title: 'Diseña flujos que responden, califican y escalan tickets sin perder contexto.',
      description:
        'Convierte cada conversación en un proceso guiado con reglas, IA, disparadores y acciones claras para tu equipo comercial y soporte.',
      bullets: [
        'Flujos por canal, etapa o intención del cliente.',
        'Desvía conversaciones al asesor correcto en segundos.',
        'Combina automatizaciones, IA y tareas manuales en un solo panel.',
      ],
    },
    {
      id: 'section-analytics',
      eyebrow: 'Operación medible',
      title: 'Visualiza rendimiento, SLA y oportunidades desde una vista ejecutiva clara.',
      description:
        'Monitorea tiempos de primera respuesta, volumen por canal, cierre de oportunidades y desempeño del equipo sin depender de hojas de cálculo.',
      bullets: [
        'Métricas diarias, semanales y mensuales en tiempo real.',
        'Comparativas entre equipos, campañas y agentes.',
        'Alertas sobre cuellos de botella y conversaciones sin seguimiento.',
      ],
    },
    {
      id: 'section-collaboration',
      eyebrow: 'Colaboración centralizada',
      title: 'Coordina ventas, soporte y operaciones en una sola experiencia compartida.',
      description:
        'Agrupa notas, etiquetas, estados, responsables y próximos pasos para que todos trabajen con la misma información del cliente.',
      bullets: [
        'Historial unificado con notas internas y etiquetas.',
        'Asignación de responsables y seguimiento por etapa.',
        'Acciones rápidas para priorizar, escalar o cerrar casos.',
      ],
    },
  ],
  faqItems: [
    {
      id: 'faq-1',
      question: '¿Qué problema resuelve WhatSaaS?',
      answer: 'Centraliza conversaciones, automatizaciones, seguimiento comercial y operaciones del equipo en una sola plataforma para WhatsApp y canales relacionados.',
    },
    {
      id: 'faq-2',
      question: '¿Puedo atender varios agentes desde una misma cuenta?',
      answer: 'Sí. El sistema está pensado para trabajo colaborativo con múltiples agentes, asignaciones, roles y trazabilidad por conversación.',
    },
    {
      id: 'faq-3',
      question: '¿Incluye bandeja compartida?',
      answer: 'Sí. Puedes gestionar conversaciones desde una bandeja compartida, filtrar por estado, agente, etiquetas y priorizar conversaciones importantes.',
    },
    {
      id: 'faq-4',
      question: '¿Se pueden automatizar respuestas?',
      answer: 'Sí. Puedes construir flujos, reglas y respuestas asistidas por IA para resolver preguntas frecuentes, captar datos y enrutar conversaciones.',
    },
    {
      id: 'faq-5',
      question: '¿Tiene CRM o seguimiento comercial?',
      answer: 'Sí. Incluye etapas, etiquetas, notas internas y seguimiento del estado de cada oportunidad o cliente dentro de la conversación.',
    },
    {
      id: 'faq-6',
      question: '¿Cómo se administran los permisos?',
      answer: 'Los administradores pueden gestionar usuarios, equipos y permisos para definir quién accede, responde, configura o supervisa cada área.',
    },
    {
      id: 'faq-7',
      question: '¿Puedo conectar más de una línea o instancia?',
      answer: 'Sí. Según tu plan puedes conectar múltiples instancias y operarlas desde la misma plataforma.',
    },
    {
      id: 'faq-8',
      question: '¿Qué métricas ofrece?',
      answer: 'Puedes revisar actividad del equipo, volumen de conversaciones, tiempos de respuesta, avances por etapa y rendimiento de campañas.',
    },
    {
      id: 'faq-9',
      question: '¿La IA puede sugerir respuestas?',
      answer: 'Sí. La plataforma puede asistir al agente con respuestas sugeridas, automatización y generación de contenido según la configuración habilitada.',
    },
    {
      id: 'faq-10',
      question: '¿Se pueden lanzar campañas?',
      answer: 'Sí. El sistema contempla campañas y herramientas para seguimiento, envío y medición del impacto según las funciones habilitadas en tu plan.',
    },
    {
      id: 'faq-11',
      question: '¿Es posible personalizar la landing?',
      answer: 'Sí. Desde el panel de administración puedes editar secciones del home, preguntas frecuentes y crear páginas adicionales para tu sitio.',
    },
    {
      id: 'faq-12',
      question: '¿Puedo crear páginas extra como “Nosotros” o “Servicios”?',
      answer: 'Sí. El panel permite crear páginas con nombre, slug y contenido para ampliar tu sitio sin tocar código.',
    },
    {
      id: 'faq-13',
      question: '¿Los cambios del home se publican de inmediato?',
      answer: 'Sí. Al guardar desde administración se revalida el contenido público para que los cambios aparezcan en la landing.',
    },
    {
      id: 'faq-14',
      question: '¿Puedo modificar las preguntas frecuentes?',
      answer: 'Sí. Las preguntas y respuestas son editables desde administración para adaptarlas a tu oferta o proceso comercial.',
    },
    {
      id: 'faq-15',
      question: '¿Necesito conocimientos técnicos para editar estas secciones?',
      answer: 'No. Las nuevas secciones, FAQs y páginas adicionales se administran desde formularios en el panel de administración.',
    },
  ],
};
