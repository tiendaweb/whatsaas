import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { aiConfigs, aiTools, automations } from '../lib/db/schema';

const TEAM_ID = 4;
const GEMINI_API_KEY = 'AQ.Ab8RN6IXhhPjx8cw_9Qx_AYNPIYNmBPdc3-VbObgwpOeDUS-ww';
const SCRATCH_DOCS_DIR = '/tmp/claude-0/-root-whatsaas/53dce9a0-c2fe-4623-bb38-bdee5027a554/scratchpad';

const DOCS = [
  'chatpro-precios-y-planes.md',
  'chatpro-funciones.md',
  'chatpro-preguntas-frecuentes.md',
  'chatpro-casos-de-uso.md',
  'chatpro-objeciones-y-respuestas.md',
];

const SYSTEM_PROMPT = `Sos el asistente de ventas de ChatPro, una plataforma que centraliza WhatsApp, CRM y automatizaciones con inteligencia artificial para negocios, sin necesitar conocimientos técnicos.

Tu trabajo es responder dudas de potenciales clientes usando la información de los documentos adjuntos (precios y planes, funciones, preguntas frecuentes, casos de uso reales, y objeciones comunes). No inventes precios, funciones, plazos ni promesas que no estén en esos documentos — si no sabés algo con certeza, decilo con honestidad y ofrecé derivar a un asesor humano.

Tono: cercano, claro, sin tecnicismos ni jerga técnica (salvo que el usuario la use primero). Respuestas breves (2 a 4 oraciones), pensadas para leerse cómodo en WhatsApp.

Cuándo usar cada función disponible:
- activar_planes_precios: cuando el usuario quiera ver los planes con más detalle de forma interactiva, comparar precios, o esté decidiendo cuál plan le conviene.
- activar_ejemplos_reales: cuando quiera ver o navegar los ejemplos reales armados con ChatPro (tienda de ropa, centro de estética, restaurante, consultorio médico).
- activar_prueba_gratis: cuando quiera empezar su prueba gratis, dejar sus datos de contacto, o esté listo para avanzar.
- handover_to_human: cuando pida explícitamente hablar con una persona, tenga una consulta muy específica de su negocio que no puedas resolver con la información disponible, o quiera negociar condiciones especiales.

No prometas funcionalidades que no estén documentadas. Ante la duda, preferí ser honesto/a y derivar antes que inventar.`;

async function main() {
  // 1. Resolve the current ChatPro automation ids (folder "ChatPro", team 4).
  const chatproAutomations = await db.query.automations.findMany({
    where: and(eq(automations.teamId, TEAM_ID)),
    columns: { id: true, name: true },
  });
  const byName = (name: string) => {
    const row = chatproAutomations.find((a) => a.name === name);
    if (!row) throw new Error(`No se encontró la automatización "${name}"`);
    return row.id;
  };
  const planesId = byName('Planes y precios ChatPro');
  const ejemplosId = byName('Ejemplos reales ChatPro');
  const contactoId = byName('Contacto / Prueba gratis ChatPro');

  console.log(`  Automatizaciones resueltas: planes=${planesId} ejemplos=${ejemplosId} contacto=${contactoId}`);

  // 2. Upload knowledge-base documents (same convention as saveAiConfig).
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'ai-attachments');
  await fs.mkdir(uploadDir, { recursive: true });

  const attachments: Array<{ name: string; url: string; type: string; size: number }> = [];
  for (const docName of DOCS) {
    const content = await fs.readFile(path.join(SCRATCH_DOCS_DIR, docName));
    const uniqueName = `${randomUUID()}.md`;
    await fs.writeFile(path.join(uploadDir, uniqueName), content);
    attachments.push({
      name: docName,
      url: `/uploads/ai-attachments/${uniqueName}`,
      type: 'text/markdown',
      size: content.length,
    });
    console.log(`  ✓ Documento subido: ${docName} -> /uploads/ai-attachments/${uniqueName}`);
  }

  // 3. Upsert the team's AI config (1 row per team).
  await db
    .insert(aiConfigs)
    .values({
      teamId: TEAM_ID,
      isActive: true,
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      apiKey: GEMINI_API_KEY,
      systemPrompt: SYSTEM_PROMPT,
      attachments,
      temperature: '0.7',
      maxOutputTokens: 1500,
    })
    .onConflictDoUpdate({
      target: aiConfigs.teamId,
      set: {
        isActive: true,
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        apiKey: GEMINI_API_KEY,
        systemPrompt: SYSTEM_PROMPT,
        attachments,
        temperature: '0.7',
        maxOutputTokens: 1500,
        updatedAt: new Date(),
      },
    });
  console.log('  ✓ aiConfigs activado (provider=gemini, model=gemini-3.6-flash) para team 4.');

  // 4. Function-calling tools that hand the conversation off to a specific automation.
  const toolDefs: Array<{ name: string; description: string; automationId: number; startNodeId: string; confirmationMessage: string }> = [
    {
      name: 'activar_planes_precios',
      description: 'Deriva la conversación al flujo interactivo de Planes y Precios de ChatPro, para que el usuario pueda comparar planes, pedir el folleto o que lo ayuden a elegir. Usar cuando el usuario quiera ver precios en detalle o esté decidiendo qué plan le conviene.',
      automationId: planesId,
      startNodeId: 'menu-planes-intro',
      confirmationMessage: 'Dale, te muestro los planes con todo el detalle 👇',
    },
    {
      name: 'activar_ejemplos_reales',
      description: 'Deriva la conversación al flujo interactivo de Ejemplos Reales de ChatPro (tienda de ropa, centro de estética, restaurante, consultorio médico). Usar cuando el usuario quiera ver o navegar casos de uso reales.',
      automationId: ejemplosId,
      startNodeId: 'menu-ejemplos',
      confirmationMessage: 'Perfecto, te muestro los negocios de ejemplo que armamos 👇',
    },
    {
      name: 'activar_prueba_gratis',
      description: 'Deriva la conversación al flujo de Contacto / Prueba Gratis de ChatPro, para dejar datos de contacto o hablar con un asesor. Usar cuando el usuario quiera empezar su prueba gratis o esté listo para avanzar.',
      automationId: contactoId,
      startNodeId: 'menu-contacto',
      confirmationMessage: '¡Buenísimo! Sigamos por acá 👇',
    },
  ];

  for (const tool of toolDefs) {
    await db
      .insert(aiTools)
      .values({
        teamId: TEAM_ID,
        name: tool.name,
        description: tool.description,
        type: 'actions',
        // NOT NULL in the live DB despite the nullable Drizzle types (schema drift)
        mediaUrl: '',
        mediaType: '',
        caption: '',
        confirmationMessage: tool.confirmationMessage,
        actionData: { actions: [{ type: 'trigger_automation', automationId: tool.automationId, startNodeId: tool.startNodeId }] },
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [aiTools.teamId, aiTools.name],
        set: {
          description: tool.description,
          type: 'actions',
          confirmationMessage: tool.confirmationMessage,
          actionData: { actions: [{ type: 'trigger_automation', automationId: tool.automationId, startNodeId: tool.startNodeId }] },
          isActive: true,
          updatedAt: new Date(),
        },
      });
    console.log(`  ✓ Tool "${tool.name}" -> automation #${tool.automationId} (${tool.startNodeId})`);
  }

  console.log('Listo. Agente de IA (Gemini 2.5 Flash) activado para team 4 con 3 tools de function calling y 5 documentos de contexto.');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
