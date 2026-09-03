import { eq } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automationFolders, automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const INSTANCE_ID = 18; // "mi vendedor v"

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

class FlowBuilder {
  nodes: NodeLike[] = [];
  edges: EdgeLike[] = [];
  private edgeIndex = 0;

  node(id: string, type: string, data: Record<string, unknown>, x: number, y: number) {
    this.nodes.push({ id, type, data, position: { x, y } });
    return id;
  }

  edge(source: string, target: string, sourceHandle?: string) {
    this.edgeIndex += 1;
    this.edges.push({
      id: `edge-${slug(source)}-${slug(sourceHandle ?? 'default')}-${slug(target)}-${this.edgeIndex}`,
      source,
      target,
      sourceHandle: sourceHandle ?? null,
    });
  }

  menu(
    id: string,
    label: string,
    options: Array<{ id: string; text: string; target: string }>,
    x: number,
    y: number,
    opts?: { fallbackTarget?: string; variable?: string },
  ) {
    this.node(
      id,
      'menu_simple',
      {
        label,
        markerStyle: 'emoji_number',
        globalDelaySeconds: 0,
        variable: opts?.variable,
        menuOptions: options.map((option) => ({ id: option.id, text: option.text })),
      },
      x,
      y,
    );
    for (const option of options) this.edge(id, option.target, `menu-${option.id}`);
    this.edge(id, opts?.fallbackTarget ?? id, 'fallback');
    return id;
  }

  flow(): Flow {
    return { nodes: this.nodes, edges: this.edges };
  }
}

function internalStart(fb: FlowBuilder, firstNodeId: string) {
  fb.node(
    'start',
    'start',
    {
      label: 'Start (interno)',
      triggerType: 'fallback',
      keywords: [],
      conditions: {},
    },
    0,
    0,
  );
  fb.edge('start', firstNodeId);
}

// ---------------------------------------------------------------------------
// Vertical configs
// ---------------------------------------------------------------------------

type ConditionBranch = { id: string; matchValue: string; label: string; message: string };

type VerticalConfig = {
  key: string;
  displayName: string;
  folderColor: string;
  keywords: string[];
  welcomeMessage: string;
  menuOptionLabels: { asesoramiento: string; reservar: string; ubicacion: string; asesor: string };
  ubicacionMessage: string;
  asesorMessage: string;
  asesoramiento: {
    q1: { label: string; variable: string };
    q2: { label: string; variable: string };
    variant: 'media' | 'condition' | 'plain';
    mediaCaption?: string;
    mediaUrl?: string;
    conditionBranches?: ConditionBranch[];
    conditionFallbackMessage?: string;
    recommendationMessage: string;
    offerBookingLabel: string;
  };
  reservas: {
    variant: 'form' | 'delay' | 'plain';
    q1: { label: string; variable: string };
    q2: { label: string; variable: string };
    confirmationMessage: string;
  };
};

const VERTICALS: VerticalConfig[] = [
  {
    key: 'indumentaria',
    displayName: 'Indumentaria',
    folderColor: '#C66B3D',
    keywords: ['ropa', 'indumentaria', 'moda'],
    welcomeMessage:
      '¡Hola! 👋 Bienvenido/a a nuestra tienda de indumentaria. Soy el asistente virtual y estoy para ayudarte. ¿Qué necesitás hoy?',
    menuOptionLabels: {
      asesoramiento: 'Asesoramiento de looks',
      reservar: 'Reservar turno para probador',
      ubicacion: 'Ubicación y horarios',
      asesor: 'Hablar con un asesor',
    },
    ubicacionMessage:
      '📍 Nos encontrás en Av. Principal 123. Horarios: Lunes a Sábado de 10 a 20hs. ¡Te esperamos!',
    asesorMessage: 'Un momento, te conecto con un miembro de nuestro equipo 👤',
    asesoramiento: {
      q1: { label: '¿Qué tipo de prenda estás buscando? (remeras, pantalones, vestidos, etc.)', variable: 'prenda_interes' },
      q2: { label: '¿Para qué ocasión la necesitás? (casual, trabajo, evento especial)', variable: 'ocasion' },
      variant: 'media',
      mediaCaption: 'Así lucen algunas de nuestras prendas más pedidas 👗👖',
      mediaUrl: 'https://placehold.co/600x400?text=Catalogo+Indumentaria',
      recommendationMessage:
        '¡Genial! Tenemos varias opciones de {{prenda_interes}} ideales para {{ocasion}}. Un asesor te va a compartir fotos y talles disponibles.',
      offerBookingLabel: '¿Querés reservar un turno para probarte las prendas en el local?',
    },
    reservas: {
      variant: 'plain',
      q1: { label: '¿A nombre de quién reservamos el turno para el probador?', variable: 'nombre_turno' },
      q2: { label: '¿Qué día y horario te queda mejor para pasar por el local?', variable: 'fecha_turno' },
      confirmationMessage:
        '¡Listo, {{nombre_turno}}! Anotamos tu turno para el probador el {{fecha_turno}}. Te vamos a confirmar la disponibilidad a la brevedad.',
    },
  },
  {
    key: 'gastronomia',
    displayName: 'Gastronomía',
    folderColor: '#606C38',
    keywords: ['restaurante', 'comida', 'menu', 'reserva mesa', 'gastronomia'],
    welcomeMessage:
      '¡Hola! 👋 Bienvenido/a a nuestro restaurante. Soy el asistente virtual, ¿en qué te puedo ayudar?',
    menuOptionLabels: {
      asesoramiento: 'Ver el menú y recomendaciones',
      reservar: 'Reservar una mesa',
      ubicacion: 'Ubicación y horarios',
      asesor: 'Hablar con un mozo/encargado',
    },
    ubicacionMessage:
      '📍 Estamos en Calle Sabores 456. Horarios: Martes a Domingo de 12 a 16hs y de 20 a 00hs.',
    asesorMessage: 'Un momento, te conecto con un miembro de nuestro equipo 👤',
    asesoramiento: {
      q1: { label: '¿Cuántas personas son?', variable: 'cantidad_personas' },
      q2: { label: '¿Tenés alguna preferencia o restricción alimentaria? (vegetariano, sin TACC, etc.)', variable: 'preferencia_alimentaria' },
      variant: 'plain',
      recommendationMessage:
        '¡Perfecto! Para {{cantidad_personas}} personas con preferencia "{{preferencia_alimentaria}}" te recomendamos nuestro menú degustación. Un mozo te va a ampliar las opciones al llegar.',
      offerBookingLabel: '¿Querés reservar una mesa ahora?',
    },
    reservas: {
      variant: 'form',
      q1: { label: '¿A nombre de quién hacemos la reserva?', variable: 'nombre_reserva' },
      q2: { label: '¿Para qué horario preferís la mesa?', variable: 'horario_reserva' },
      confirmationMessage: '¡Reserva anotada, {{nombre_reserva}}! Te esperamos en el horario elegido. 🍽️',
    },
  },
  {
    key: 'consultorio-medico',
    displayName: 'Consultorio Médico',
    folderColor: '#6B7C85',
    keywords: ['turno medico', 'consultorio', 'doctor', 'medico', 'salud'],
    welcomeMessage:
      '¡Hola! 👋 Bienvenido/a al consultorio. Soy el asistente virtual, ¿en qué te puedo ayudar hoy?',
    menuOptionLabels: {
      asesoramiento: 'Asesoramiento sobre especialidades',
      reservar: 'Reservar un turno',
      ubicacion: 'Ubicación y horarios',
      asesor: 'Hablar con recepción',
    },
    ubicacionMessage:
      '📍 Nos ubicamos en Av. Salud 789, piso 2. Horarios de atención: Lunes a Viernes de 9 a 18hs.',
    asesorMessage: 'Un momento, te conecto con recepción 👤',
    asesoramiento: {
      q1: { label: '¿Qué especialidad estás buscando? (clínica general, pediatría, cardiología, etc.)', variable: 'especialidad_interes' },
      q2: { label: '¿Contás con obra social/prepaga o la consulta sería particular?', variable: 'cobertura' },
      variant: 'condition',
      conditionBranches: [
        {
          id: 'obra-social',
          matchValue: 'obra social',
          label: 'Tiene obra social',
          message: 'Genial, trabajamos con las principales obras sociales. Vamos a confirmar tu cobertura antes del turno.',
        },
        {
          id: 'prepaga',
          matchValue: 'prepaga',
          label: 'Tiene prepaga',
          message: 'Perfecto, aceptamos varias prepagas. Vamos a confirmar tu cobertura antes del turno.',
        },
      ],
      conditionFallbackMessage: 'Sin problema, también atendemos consultas particulares.',
      recommendationMessage: 'Para {{especialidad_interes}} tenemos disponibilidad esta semana.',
      offerBookingLabel: '¿Querés que reservemos tu turno ahora?',
    },
    reservas: {
      variant: 'plain',
      q1: { label: '¿Cuál es tu nombre completo?', variable: 'nombre_paciente' },
      q2: { label: '¿Qué día y horario preferís para el turno?', variable: 'fecha_turno_medico' },
      confirmationMessage:
        '¡Gracias, {{nombre_paciente}}! Tu turno para el {{fecha_turno_medico}} quedó solicitado, sujeto a confirmación de nuestro equipo.',
    },
  },
  {
    key: 'centro-estetica',
    displayName: 'Centro de Estética',
    folderColor: '#9B6A6C',
    keywords: ['estetica', 'tratamiento', 'belleza', 'spa'],
    welcomeMessage:
      '¡Hola! 👋 Bienvenido/a a nuestro centro de estética. Soy el asistente virtual, ¿en qué te puedo ayudar?',
    menuOptionLabels: {
      asesoramiento: 'Asesoramiento sobre tratamientos',
      reservar: 'Reservar un turno',
      ubicacion: 'Ubicación y horarios',
      asesor: 'Hablar con una asesora',
    },
    ubicacionMessage:
      '📍 Estamos en Av. Bienestar 321. Horarios: Lunes a Sábado de 9 a 19hs.',
    asesorMessage: 'Un momento, te conecto con una asesora 👤',
    asesoramiento: {
      q1: { label: '¿Qué tratamiento te interesa? (limpieza facial, masajes, depilación, etc.)', variable: 'tratamiento_interes' },
      q2: { label: '¿Es tu primera vez en el centro?', variable: 'primera_vez' },
      variant: 'plain',
      recommendationMessage: '¡Perfecto! Para {{tratamiento_interes}} tenemos varias opciones que se adaptan a vos.',
      offerBookingLabel: '¿Reservamos tu turno?',
    },
    reservas: {
      variant: 'delay',
      q1: { label: '¿A nombre de quién reservamos el turno?', variable: 'nombre_estetica' },
      q2: { label: '¿Qué día preferís para tu turno?', variable: 'fecha_estetica' },
      confirmationMessage: '¡Listo, {{nombre_estetica}}! Tu turno para el {{fecha_estetica}} quedó agendado. ✨',
    },
  },
];

// ---------------------------------------------------------------------------
// Flow construction
// ---------------------------------------------------------------------------

function buildInicioFlow(cfg: VerticalConfig, asesoramientoId: number, asesoramientoFirstNode: string, reservasId: number, reservasFirstNode: string): Flow {
  const fb = new FlowBuilder();
  fb.node('start', 'start', {
    label: `Start ${cfg.displayName}`,
    triggerType: 'contains',
    keywords: cfg.keywords,
    conditions: {},
  }, 0, 0);
  fb.node('msg-welcome', 'message', { label: cfg.welcomeMessage }, 320, 0);
  fb.edge('start', 'msg-welcome');

  fb.node('sticky-note', 'sticky_note', {
    title: `Demo comercial · ${cfg.displayName}`,
    bodyText: `Flujo de ejemplo para el rubro ${cfg.displayName}. Usa "ir al nodo" para derivar a Asesoramiento y Reservas.`,
  }, 320, -260);

  fb.node('msg-ubicacion', 'message', { label: cfg.ubicacionMessage }, 960, -180);
  fb.node('end-ubicacion', 'end', { disableAutomation: false }, 1280, -180);
  fb.edge('msg-ubicacion', 'end-ubicacion');

  fb.node('msg-asesor', 'message', { label: cfg.asesorMessage }, 960, 180);
  fb.node('ai-control-asesor', 'ai_control', { action: 'paused' }, 1280, 180);
  fb.node('end-asesor', 'end', { disableAutomation: true }, 1600, 180);
  fb.edge('msg-asesor', 'ai-control-asesor');
  fb.edge('ai-control-asesor', 'end-asesor');

  fb.node('goto-asesoramiento', 'go_to_node', {
    mode: 'other_flow',
    targetAutomationId: asesoramientoId,
    targetNodeId: asesoramientoFirstNode,
    fallbackAction: 'stop',
  }, 960, -60);

  fb.node('goto-reservas', 'go_to_node', {
    mode: 'other_flow',
    targetAutomationId: reservasId,
    targetNodeId: reservasFirstNode,
    fallbackAction: 'stop',
  }, 960, 60);

  fb.menu(
    'menu-main',
    '¿Qué necesitás?',
    [
      { id: 'asesoramiento', text: cfg.menuOptionLabels.asesoramiento, target: 'goto-asesoramiento' },
      { id: 'reservar', text: cfg.menuOptionLabels.reservar, target: 'goto-reservas' },
      { id: 'ubicacion', text: cfg.menuOptionLabels.ubicacion, target: 'msg-ubicacion' },
      { id: 'asesor', text: cfg.menuOptionLabels.asesor, target: 'msg-asesor' },
    ],
    640,
    0,
  );
  fb.edge('msg-welcome', 'menu-main');

  return fb.flow();
}

function buildAsesoramientoFlow(cfg: VerticalConfig, reservasId: number, reservasFirstNode: string): { flow: Flow; firstNodeId: string } {
  const fb = new FlowBuilder();
  const firstNodeId = 'collect-1';
  internalStart(fb, firstNodeId);

  fb.node(firstNodeId, 'collect', { label: cfg.asesoramiento.q1.label, variable: cfg.asesoramiento.q1.variable }, 320, 0);
  fb.node('collect-2', 'collect', { label: cfg.asesoramiento.q2.label, variable: cfg.asesoramiento.q2.variable }, 640, 0);
  fb.edge(firstNodeId, 'collect-2');

  let lastNodeBeforeOffer: string;

  if (cfg.asesoramiento.variant === 'media') {
    fb.node('msg-recomendacion', 'message', { label: cfg.asesoramiento.recommendationMessage }, 960, 0);
    fb.edge('collect-2', 'msg-recomendacion');
    fb.node('media-catalogo', 'media', {
      mediaType: 'image',
      mediaUrl: cfg.asesoramiento.mediaUrl,
      caption: cfg.asesoramiento.mediaCaption,
    }, 1280, 0);
    fb.edge('msg-recomendacion', 'media-catalogo');
    lastNodeBeforeOffer = 'media-catalogo';
  } else if (cfg.asesoramiento.variant === 'condition') {
    fb.node('condition-cobertura', 'condition', {
      label: 'Evalúa la cobertura indicada por el paciente',
      conditions: (cfg.asesoramiento.conditionBranches ?? []).map((branch) => ({
        id: branch.id,
        type: 'text',
        operator: 'contains',
        value: branch.matchValue,
        label: branch.label,
      })),
    }, 960, 0);
    fb.edge('collect-2', 'condition-cobertura');

    fb.node('msg-recomendacion', 'message', { label: cfg.asesoramiento.recommendationMessage }, 1600, 0);

    for (const branch of cfg.asesoramiento.conditionBranches ?? []) {
      const msgId = `msg-branch-${branch.id}`;
      fb.node(msgId, 'message', { label: branch.message }, 1280, branch.id === 'obra-social' ? -160 : 0);
      fb.edge('condition-cobertura', msgId, branch.id);
      fb.edge(msgId, 'msg-recomendacion');
    }
    const fallbackMsgId = 'msg-branch-fallback';
    fb.node(fallbackMsgId, 'message', { label: cfg.asesoramiento.conditionFallbackMessage ?? '' }, 1280, 160);
    fb.edge('condition-cobertura', fallbackMsgId, 'fallback');
    fb.edge(fallbackMsgId, 'msg-recomendacion');

    lastNodeBeforeOffer = 'msg-recomendacion';
  } else {
    fb.node('msg-recomendacion', 'message', { label: cfg.asesoramiento.recommendationMessage }, 960, 0);
    fb.edge('collect-2', 'msg-recomendacion');
    lastNodeBeforeOffer = 'msg-recomendacion';
  }

  fb.node('goto-reservas', 'go_to_node', {
    mode: 'other_flow',
    targetAutomationId: reservasId,
    targetNodeId: reservasFirstNode,
    fallbackAction: 'stop',
  }, 1920, -80);
  fb.node('end-no-reserva', 'end', { disableAutomation: false }, 1920, 80);

  fb.menu('menu-offer', cfg.asesoramiento.offerBookingLabel, [
    { id: 'si', text: 'Sí, reservar', target: 'goto-reservas' },
    { id: 'no', text: 'No, gracias', target: 'end-no-reserva' },
  ], 1600, 200);
  fb.edge(lastNodeBeforeOffer, 'menu-offer');

  return { flow: fb.flow(), firstNodeId };
}

function buildReservasFlow(cfg: VerticalConfig): { flow: Flow; firstNodeId: string } {
  const fb = new FlowBuilder();

  let firstNodeId: string;
  let lastCollectNode: string;

  if (cfg.reservas.variant === 'form') {
    firstNodeId = 'form-reserva';
    fb.node(firstNodeId, 'form', {
      fields: [
        { id: 'nombre', type: 'text', label: cfg.reservas.q1.label, variable: cfg.reservas.q1.variable },
        {
          id: 'horario',
          type: 'menu',
          label: cfg.reservas.q2.label,
          variable: cfg.reservas.q2.variable,
          markerStyle: 'emoji_number',
          menuOptions: [
            { id: 'mediodia', text: 'Mediodía (12 a 15hs)' },
            { id: 'noche', text: 'Noche (20 a 00hs)' },
          ],
        },
      ],
    }, 320, 0);
    lastCollectNode = firstNodeId;
  } else {
    firstNodeId = 'collect-nombre';
    fb.node(firstNodeId, 'collect', { label: cfg.reservas.q1.label, variable: cfg.reservas.q1.variable }, 320, 0);
    fb.node('collect-fecha', 'collect', { label: cfg.reservas.q2.label, variable: cfg.reservas.q2.variable }, 640, 0);
    fb.edge(firstNodeId, 'collect-fecha');
    lastCollectNode = 'collect-fecha';
  }

  internalStart(fb, firstNodeId);

  let lastNode = lastCollectNode;
  if (cfg.reservas.variant === 'delay') {
    fb.node('delay-verificando', 'delay', { seconds: 3, label: 'Buscando disponibilidad…' }, 960, 0);
    fb.edge(lastCollectNode, 'delay-verificando');
    lastNode = 'delay-verificando';
  }

  fb.node('msg-confirmacion', 'message', { label: cfg.reservas.confirmationMessage }, 1280, 0);
  fb.edge(lastNode, 'msg-confirmacion');

  fb.node('save-contact', 'save_contact', {
    nameVariable: `{{${cfg.reservas.q1.variable}}}`,
  }, 1600, 0);
  fb.edge('msg-confirmacion', 'save-contact');

  fb.node('end-reserva', 'end', { disableAutomation: false }, 1920, 0);
  fb.edge('save-contact', 'end-reserva');

  return { flow: fb.flow(), firstNodeId };
}

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges as never[] });
  if (!prepared.success) {
    throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  }
  const ids = new Set(prepared.nodes.map((node) => node.id));
  for (const edge of prepared.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`${name}: arista inválida ${edge.id} (${edge.source} -> ${edge.target})`);
    }
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function main() {
  console.log(`Creando ${VERTICALS.length} carpetas + ${VERTICALS.length * 3} automatizaciones demo para team ${TEAM_ID}...`);

  await db.transaction(async (tx) => {
    const existingFolders = await tx.query.automationFolders.findMany({
      where: eq(automationFolders.teamId, TEAM_ID),
    });

    for (const cfg of VERTICALS) {
      // 1. Folder
      let folderId: number;
      const existing = existingFolders.find((f) => f.name === cfg.displayName);
      if (existing) {
        folderId = existing.id;
        console.log(`  Carpeta "${cfg.displayName}" ya existe (id ${folderId}), reutilizando.`);
      } else {
        const [folder] = await tx
          .insert(automationFolders)
          .values({
            teamId: TEAM_ID,
            parentId: null,
            name: cfg.displayName,
            color: cfg.folderColor,
            position: existingFolders.length,
          })
          .returning();
        folderId = folder.id;
        console.log(`  Carpeta "${cfg.displayName}" creada (id ${folderId}).`);
      }

      // 2. Placeholder automations to obtain real ids for cross-linking.
      const placeholderStart = (label: string) => [
        { id: 'placeholder-start', type: 'start', position: { x: 0, y: 0 }, data: { label, triggerType: 'fallback', keywords: [], conditions: {} } },
      ];

      const [inicioRow] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId,
        name: `Inicio ${cfg.displayName}`,
        note: 'Automatización demo generada automáticamente.',
        nodes: placeholderStart('Start'), edges: [], isActive: false,
      }).returning({ id: automations.id });

      const [asesoramientoRow] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId,
        name: `Asesoramiento ${cfg.displayName}`,
        note: 'Automatización demo generada automáticamente.',
        nodes: placeholderStart('Start interno'), edges: [], isActive: false,
      }).returning({ id: automations.id });

      const [reservasRow] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId,
        name: `Reservas ${cfg.displayName}`,
        note: 'Automatización demo generada automáticamente.',
        nodes: placeholderStart('Start interno'), edges: [], isActive: false,
      }).returning({ id: automations.id });

      // 3. Build real flows now that ids are known.
      const { flow: reservasFlow, firstNodeId: reservasFirstNode } = buildReservasFlow(cfg);
      const { flow: asesoramientoFlow, firstNodeId: asesoramientoFirstNode } = buildAsesoramientoFlow(
        cfg,
        reservasRow.id,
        reservasFirstNode,
      );
      const inicioFlow = buildInicioFlow(
        cfg,
        asesoramientoRow.id,
        asesoramientoFirstNode,
        reservasRow.id,
        reservasFirstNode,
      );

      const validatedReservas = validatePrepared(`Reservas ${cfg.displayName}`, reservasFlow);
      const validatedAsesoramiento = validatePrepared(`Asesoramiento ${cfg.displayName}`, asesoramientoFlow);
      const validatedInicio = validatePrepared(`Inicio ${cfg.displayName}`, inicioFlow);

      await tx.update(automations).set({ nodes: validatedReservas.nodes, edges: validatedReservas.edges, updatedAt: new Date() })
        .where(eq(automations.id, reservasRow.id));
      await tx.update(automations).set({ nodes: validatedAsesoramiento.nodes, edges: validatedAsesoramiento.edges, updatedAt: new Date() })
        .where(eq(automations.id, asesoramientoRow.id));
      await tx.update(automations).set({ nodes: validatedInicio.nodes, edges: validatedInicio.edges, updatedAt: new Date() })
        .where(eq(automations.id, inicioRow.id));

      console.log(`  ✓ ${cfg.displayName}: Inicio(#${inicioRow.id}) -> Asesoramiento(#${asesoramientoRow.id}) -> Reservas(#${reservasRow.id})`);
    }
  });

  console.log('Listo. Todas las automatizaciones quedaron creadas como borrador (isActive=false).');
}

main()
  .catch((error) => {
    console.error('ERROR', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
