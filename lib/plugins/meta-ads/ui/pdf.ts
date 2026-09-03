import type { OverviewCampaignRow, OverviewKpis } from '@/lib/ads/types';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from './format';

const BRAND: [number, number, number] = [73, 182, 83]; // #49b653

/** Colores forzados para el PDF: el gráfico se imprime sobre blanco, venga de tema claro u oscuro. */
const PDF_TEXT = '#334155';
const PDF_GRID = '#CBD5E1';

/**
 * Recharts renderiza SVG puro (sin foreignObject), así que lo rasterizamos a mano y nos
 * ahorramos html2canvas. El detalle fino: los estilos vienen de clases CSS y de variables
 * de tema, que NO viajan al serializar el nodo. Por eso copiamos los estilos computados
 * a atributos inline antes de serializar.
 */
async function chartToPng(container: HTMLElement | null): Promise<string | null> {
  if (!container) return null;

  const source = container.querySelector('svg');
  if (!source) return null;

  const width = source.clientWidth || source.viewBox.baseVal.width || 800;
  const height = source.clientHeight || source.viewBox.baseVal.height || 300;
  if (!width || !height) return null;

  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const originals = source.querySelectorAll('*');
  const clones = clone.querySelectorAll('*');

  originals.forEach((original, index) => {
    const target = clones[index] as SVGElement | undefined;
    if (!target) return;

    const computed = window.getComputedStyle(original);
    const isText = target.tagName.toLowerCase() === 'text';

    // Los ejes y la grilla salen de clases Tailwind: sin esto quedan negros o invisibles.
    target.setAttribute('fill', isText ? PDF_TEXT : computed.fill);
    if (computed.stroke && computed.stroke !== 'none') {
      target.setAttribute('stroke', isText ? 'none' : computed.stroke);
    }
    if (target.classList.contains('recharts-cartesian-grid-horizontal') || target.tagName === 'line') {
      target.setAttribute('stroke', PDF_GRID);
    }
    if (computed.strokeWidth) target.setAttribute('stroke-width', computed.strokeWidth);
    if (computed.fontSize) target.setAttribute('font-size', computed.fontSize);
    if (computed.fontFamily) target.setAttribute('font-family', computed.fontFamily);
  });

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(background, clone.firstChild);

  const serialized = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  await image.decode();

  const canvas = document.createElement('canvas');
  const scale = 2; // el PDF amplía: rasterizar a 1x se ve borroso
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}

export async function exportCampaignsPdf(input: {
  accountName: string;
  currency: string;
  taxRate: number;
  range: { since: string; until: string };
  kpis: OverviewKpis;
  resultLabel: string;
  rows: OverviewCampaignRow[];
  chartContainer: HTMLElement | null;
  lastSyncedAt: string | null;
}): Promise<void> {
  const { accountName, currency, taxRate, range, kpis, resultLabel, rows, lastSyncedAt } = input;

  // Import dinámico: jsPDF pesa ~400 KB y no tiene por qué estar en el bundle de todos.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const landscape = rows.length > 20;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Meta Ads', margin, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${accountName} · ${formatDate(range.since)} a ${formatDate(range.until)}`, margin, 64);
  doc.text(
    `Generado el ${formatDateTime(new Date().toISOString())} · Importes finales, con ${formatNumber(taxRate)}% de impuesto incluido`,
    margin,
    78,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 94,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fontStyle: 'bold', textColor: 100, fontSize: 8 },
    bodyStyles: { fontStyle: 'bold', fontSize: 12 },
    head: [['Inversión final', 'Neto', 'Impuesto', resultLabel, 'Costo por resultado', 'Clics', 'CTR']],
    body: [[
      formatCurrency(kpis.spend, currency),
      formatCurrency(kpis.spendNet, currency),
      formatCurrency(kpis.tax, currency),
      formatNumber(kpis.results),
      formatCurrency(kpis.costPerResult, currency),
      formatNumber(kpis.clicks),
      formatPercent(kpis.ctr),
    ]],
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 16;

  // Si el gráfico falla, el reporte sale igual: preferimos un PDF sin gráfico a ninguno.
  try {
    const png = await chartToPng(input.chartContainer);
    if (png) {
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = landscape ? 170 : 200;
      doc.addImage(png, 'PNG', margin, cursorY, imageWidth, imageHeight);
      cursorY += imageHeight + 16;
    }
  } catch (error) {
    console.warn('[meta-ads/pdf] no se pudo incrustar el gráfico', error);
  }

  autoTable(doc, {
    startY: cursorY,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: landscape ? 200 : 150 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    head: [
      ['Campaña', 'Objetivo', 'Inversión final', 'Neto', resultLabel, 'Costo/result.', 'Impresiones', 'Clics', 'CTR'],
    ],
    body: rows.map((row) => [
      row.name,
      row.objectiveLabel,
      formatCurrency(row.spend, currency),
      formatCurrency(row.spendNet, currency),
      formatNumber(row.results),
      formatCurrency(row.costPerResult, currency),
      formatNumber(row.impressions),
      formatNumber(row.clicks),
      formatPercent(row.ctr),
    ]),
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      const page = doc.getCurrentPageInfo().pageNumber;

      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        lastSyncedAt
          ? `Datos sincronizados desde Meta el ${formatDateTime(lastSyncedAt)}`
          : 'Datos sincronizados desde Meta',
        margin,
        pageHeight - 20,
      );
      doc.text(`Página ${page}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  const slug = accountName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`meta-ads-${slug}-${range.since}_${range.until}.pdf`);
}
