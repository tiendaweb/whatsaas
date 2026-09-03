import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { jsPDF } from 'jspdf';

const OUT_DIR = path.join(process.cwd(), 'public', 'uploads', 'automation');
const OUT_ID = randomUUID();
const OUT_FILENAME = `${OUT_ID}.pdf`;
const OUT_PATH = path.join(OUT_DIR, OUT_FILENAME);

const BRAND: [number, number, number] = [37, 99, 235]; // #2563EB
const DARK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const LIGHT_BG: [number, number, number] = [241, 245, 249]; // slate-100

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 0;

  // --- Header band ---
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('ChatPro', margin, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('Automatizá tus ventas y soporte por WhatsApp', margin, 32);

  y = 54;

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Centralizá tus chats, armá flujos de automatización y escalá tu negocio', margin, y);
  y += 6;
  doc.text('con nuestra plataforma todo-en-uno de CRM + IA. Sin necesidad de programar.', margin, y);
  y += 12;

  // --- Stats row ---
  const stats: [string, string][] = [
    ['+38%', 'más cierres de venta'],
    ['-62%', 'menos caos en la atención'],
    ['24/7', 'atención activa'],
  ];
  const statBoxWidth = (pageWidth - margin * 2 - 8 * 2) / 3;
  stats.forEach(([big, small], i) => {
    const x = margin + i * (statBoxWidth + 8);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(x, y, statBoxWidth, 22, 2, 2, 'F');
    doc.setTextColor(...BRAND);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(big, x + statBoxWidth / 2, y + 10, { align: 'center' });
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(small, x + statBoxWidth / 2, y + 17, { align: 'center' });
  });
  y += 34;

  // --- Features ---
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Todo lo que hace ChatPro por vos', margin, y);
  y += 8;

  const features: [string, string][] = [
    ['Constructor visual de flujos', 'Armá automatizaciones complejas arrastrando y soltando bloques. Sin escribir una sola línea de código.'],
    ['Agentes de IA', 'Entrená agentes de IA para resolver consultas, coordinar turnos y hasta enviar archivos, con herramientas configurables.'],
    ['Campañas masivas', 'Mandá mensajes a toda tu lista de contactos con un clic para reactivar clientes dormidos.'],
    ['Múltiples dispositivos', 'Conectá WhatsApp Web (código QR) o la API oficial de WhatsApp Business (WABA), lo que necesite tu negocio.'],
    ['Bandeja centralizada', 'Todas tus conversaciones de WhatsApp en un solo lugar, con vista Kanban, etiquetas y asignación por equipo.'],
    ['Colaboración en equipo', 'Invitá a tu equipo, asigná roles y repartí las conversaciones automáticamente.'],
    ['Analítica en tiempo real', 'Paneles con el rendimiento del embudo de ventas, de cada agente y de cada campaña.'],
  ];

  doc.setFontSize(10.5);
  for (const [title, desc] of features) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(`• ${title}`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(desc, pageWidth - margin * 2 - 4);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4.6 + 3.5;
  }

  // --- Page 2: pricing ---
  doc.addPage();
  y = 24;
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Planes y precios', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text('1 día gratis para probar. No se pide tarjeta de crédito.', margin, y + 6);
  y += 18;

  type Plan = { name: string; price: string; highlight?: boolean; items: string[] };
  const plans: Plan[] = [
    {
      name: 'Esencial', price: '$45/mes',
      items: ['3 usuarios', '1 conexión de WhatsApp', '2.000 contactos', 'Agente de IA', 'Constructor visual de flujos'],
    },
    {
      name: 'Premium Mensual', price: '$60/mes', highlight: true,
      items: ['10 usuarios', '5 conexiones de WhatsApp', '5.000 contactos', 'Agente de IA', 'Constructor visual de flujos'],
    },
  ];

  const cardWidth = (pageWidth - margin * 2 - 10) / 2;
  plans.forEach((plan, i) => {
    const x = margin + i * (cardWidth + 10);
    const cardHeight = 78;
    if (plan.highlight) {
      doc.setFillColor(...BRAND);
      doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setDrawColor(...LIGHT_BG);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'S');
      doc.setTextColor(...DARK);
    }
    let cy = y + 12;
    if (plan.highlight) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('★ EL MÁS ELEGIDO', x + 8, cy - 5);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(plan.name, x + 8, cy);
    cy += 9;
    doc.setFontSize(20);
    doc.text(plan.price, x + 8, cy);
    cy += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(plan.highlight ? 255 : DARK[0], plan.highlight ? 255 : DARK[1], plan.highlight ? 255 : DARK[2]);
    for (const item of plan.items) {
      doc.text(`✓ ${item}`, x + 8, cy);
      cy += 6.5;
    }
  });
  y += 78 + 16;

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('¿Preguntas frecuentes?', margin, y);
  y += 8;
  const faqs = [
    '¿Qué gana mi negocio con ChatPro desde el primer día?',
    '¿Sí me ayuda a dejar de perder mensajes y oportunidades?',
    '¿Las respuestas automáticas sirven para vender, no solo para adornar?',
    '¿Puedo manejar varias líneas o cuentas desde un mismo lugar?',
    '¿Me sirve si quiero escalar sin contratar gente a lo loco?',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  for (const q of faqs) {
    doc.text(`•  ${q}`, margin, y);
    y += 6;
  }

  y += 10;
  doc.setDrawColor(...LIGHT_BG);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text('chatpro.uno', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text('Probalo gratis por 1 día, sin tarjeta.', pageWidth - margin, y, { align: 'right' });

  const arrayBuffer = doc.output('arraybuffer');
  fs.writeFileSync(OUT_PATH, Buffer.from(arrayBuffer));

  console.log('PDF generado:', OUT_PATH);
  console.log('Public path:', `/uploads/automation/${OUT_FILENAME}`);
}

main();
