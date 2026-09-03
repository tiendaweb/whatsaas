import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const SCRIPT_TEXT =
  '¡Hola! Soy el asistente virtual de Chat Pro. Te cuento en pocas palabras qué hacemos. ' +
  'Centralizamos todas tus conversaciones de WhatsApp en un solo lugar, armamos automatizaciones como esta misma con la que te estoy hablando, sin que necesites saber programar, ' +
  'y sumamos inteligencia artificial para que atiendas a tus clientes las veinticuatro horas del día. ' +
  'Nuestros clientes cierran un treinta y ocho por ciento más de ventas, y reducen el caos de atención en un sesenta y dos por ciento. ' +
  'Tenés un día gratis para probarlo, sin necesidad de tarjeta de crédito. ' +
  'Escribí PLANES para ver los precios, o EJEMPLOS para ver flujos reales que armamos para otros negocios. ' +
  'Vamos a hacer crecer tu negocio, juntos.';

const OUT_DIR = path.join(process.cwd(), 'public', 'uploads', 'automation');
const OUT_ID = randomUUID();
const OUT_PATH = path.join(OUT_DIR, `${OUT_ID}.mp3`);
const VENV_PYTHON = process.env.TTS_PYTHON || '/tmp/claude-0/-root-whatsaas/53dce9a0-c2fe-4623-bb38-bdee5027a554/scratchpad/tts-venv/bin/python3';

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pyScript = `
from gtts import gTTS
t = gTTS(text=${JSON.stringify(SCRIPT_TEXT)}, lang='es', tld='com.ar')
t.save(${JSON.stringify(OUT_PATH)})
print('OK')
`;
  const tmpPy = path.join(OUT_DIR, `.tts-${OUT_ID}.py`);
  fs.writeFileSync(tmpPy, pyScript);
  try {
    const out = execFileSync(VENV_PYTHON, [tmpPy], { encoding: 'utf-8' });
    console.log(out.trim());
  } finally {
    fs.rmSync(tmpPy, { force: true });
  }

  console.log('Audio generado:', OUT_PATH);
  console.log('Public path:', `/uploads/automation/${OUT_ID}.mp3`);
}

main();
