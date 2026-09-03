import postgres from 'postgres';

const TEAM_ID = 2;
const AUDIT_SOURCE = 'chat_receipt_audit_v1';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const cents = (amount) => Math.round(amount * 100);

const customers = [
  { key: 'ofertas-locales', name: 'Ofertas Locales / Ariel Pablo Wawrzyniak', contactId: 49, chatId: 394, notes: 'Cliente confirmado por dos pagos del desarrollo web personalizado.' },
  { key: 'diego-shocktv', name: 'Diego Sebastián García / ShockTV', status: 'inactive', contactId: 38, chatId: 2008, notes: 'Proyecto de plataforma de streaming cancelado; seña de ARS 25.000 confirmada.' },
  { key: 'eze-usay', name: 'Ezequiel Guillermo Leandro Usay', contactId: 52, chatId: 3257, notes: 'Ampliación web e integración de sección Hotmart.' },
  { key: 'maria-luz', name: 'María Luz Genovese', contactId: 127, chatId: 5059, notes: 'Sitio Web Profesional; seña del 50% confirmada.' },
  { key: 'gonsanz', name: 'GONSANZ Servicios Integrales / Juan Pablo Gonzalez', contactId: 416, chatId: 48990, notes: 'Desarrollo e instalación personalizada en Donweb.' },
  { key: 'focuson', name: 'Óptica Focus On / Héctor Matías Amedei', contactId: 493, chatId: 64211, notes: 'Proyecto web opticafocuson.com.ar.' },
  { key: 'eme-joyas', name: 'e.M.e Joyas / Melisa María Laura Martínez', contactId: 674, chatId: 66417, notes: 'Tienda Online anual; seña del 50% confirmada.' },
  { key: 'kairos', name: 'Kairós Products / Víctor Luciano Zalazar', contactId: 407, chatId: 48388, notes: 'Sitio Web + Tienda Online; seña del 50% confirmada.' },
  { key: 'lear-espejos', name: 'LEAR Espejos / María Laura Cartelle', contactId: 184, chatId: 11518, notes: 'El chat conservaba un nombre histórico (EPV); la identidad del pago y servicio es LEAR Espejos.' },
  { key: 'volanteo', name: 'Volanteo Digital / Francisco Javier Riquelme', contactId: null, chatId: 627, notes: 'Intermediario de proyectos web. Dos pagos no permiten identificar al cliente final y se conservan bajo el intermediario.' },
  { key: 'martin-stl', name: 'STL Construcciones y Servicios / Martin Horacio Molina', email: 'martinhmolina@hotmail.com', phone: '+54 9 11 2737-1245', contactId: 260, chatId: 16400, notes: 'Cliente de Gestión de publicidad digital / Meta Ads. No confundir con Martin Dev, miembro del equipo.' },
];

const contactLinks = [
  [17, 44], [16, 45], [46, 40], [94, 37], [106, 38], [97, 34], [172, 31],
  [125, 33], [33, 46], [519, 68], [350, 15], [451, 8], [402, 10], [107, 60],
];

const subscriptions = [
  { key: 'ofertas-custom', customer: 'ofertas-locales', companyId: 14, planId: null, number: 'CHAT-OFERTAS-202603', name: 'Desarrollo web personalizado', price: cents(150000), billingType: 'custom', status: 'active', paymentStatus: 'paid', startDate: '2026-03-21', endDate: null },
  { key: 'diego-custom', customer: 'diego-shocktv', companyId: 14, planId: null, number: 'CHAT-SHOCKTV-202604', name: 'Desarrollo plataforma de streaming', price: cents(150000), billingType: 'custom', status: 'cancelled', paymentStatus: 'paid', startDate: '2026-04-01', endDate: '2026-04-30' },
  { key: 'eze-hotmart', customer: 'eze-usay', companyId: 14, planId: null, number: 'CHAT-EZE-202604', name: 'Ampliación web e integración Hotmart', price: cents(20000), billingType: 'custom', status: 'active', paymentStatus: 'paid', startDate: '2026-04-06', endDate: null },
  { key: 'luz-site', customer: 'maria-luz', companyId: 2, planId: 252, number: 'CHAT-LUZ-202604', name: 'Sitio Web Profesional', price: cents(150000), billingType: 'annual', status: 'active', paymentStatus: 'pending', startDate: '2026-04-16', endDate: '2027-04-16' },
  { key: 'gonsanz-custom', customer: 'gonsanz', companyId: 14, planId: null, number: 'CHAT-GONSANZ-202607', name: 'Desarrollo e instalación personalizada', price: cents(75000), billingType: 'custom', status: 'active', paymentStatus: 'pending', startDate: '2026-07-02', endDate: null },
  { key: 'focuson-web', customer: 'focuson', companyId: 2, planId: 24, number: 'CHAT-FOCUSON-202607', name: 'Sitio Web + Tienda Online', price: cents(200000), billingType: 'custom', status: 'active', paymentStatus: 'pending', startDate: '2026-07-23', endDate: '2027-07-23' },
  { key: 'eme-store', customer: 'eme-joyas', companyId: 2, planId: 20, number: 'CHAT-EME-202607', name: 'Tienda Online', price: cents(40000), billingType: 'annual', status: 'active', paymentStatus: 'pending', startDate: '2026-07-23', endDate: '2027-07-23' },
  { key: 'kairos-combo', customer: 'kairos', companyId: 2, planId: 24, number: 'CHAT-KAIROS-202607', name: 'Sitio Web + Tienda Online', price: cents(100000), billingType: 'annual', status: 'active', paymentStatus: 'pending', startDate: '2026-07-29', endDate: '2027-07-29' },
  { key: 'lear-combo', customer: 'lear-espejos', companyId: 2, planId: 24, number: 'CHAT-LEAR-202608', name: 'Sitio Web + Tienda Online', price: cents(60000), billingType: 'annual', status: 'active', paymentStatus: 'pending', startDate: '2026-08-03', endDate: '2027-08-03' },
  { key: 'volanteo-service', customer: 'volanteo', companyId: 14, planId: null, number: 'CHAT-VOLANTEO-202606', name: 'Intermediación de proyectos web', price: cents(25000), billingType: 'custom', status: 'active', paymentStatus: 'paid', startDate: '2026-06-03', endDate: null },
  { key: 'martin-ads', customer: 'martin-stl', companyId: 14, planId: 280, number: 'CHAT-STL-ADS-202605', name: 'Gestión de publicidad digital / Meta Ads', price: cents(50000), billingType: 'monthly', status: 'active', paymentStatus: 'paid', startDate: '2026-05-08', endDate: null },
  { key: 'brenda-ads', customerId: 68, companyId: 14, planId: 280, number: 'CHAT-VIDITAS-ADS-202606', name: 'Gestión y fondos de publicidad Meta', price: cents(100000), billingType: 'monthly', status: 'active', paymentStatus: 'paid', startDate: '2026-06-14', endDate: null },
  { key: 'pablo-ads', customerId: 60, companyId: 14, planId: 280, number: 'CHAT-PASEOS-ADS-202604', name: 'Campaña publicitaria Meta Ads', price: cents(100000), billingType: 'monthly', status: 'active', paymentStatus: 'paid', startDate: '2026-04-08', endDate: null },
];

const receipt = (id, extraTags = []) => ({ id, extraTags });
const operation = (key, date, amount, title, options = {}) => ({
  key, date, amount: cents(amount), currency: 'ARS', type: 'income', status: 'paid',
  title, category: 'Venta de servicio', counterparty: null, paymentMethod: 'Transferencia',
  recurrence: 'none', receipts: [], tags: ['comprobante', 'transferencia'], ...options,
});

const operations = [
  operation('ofertas-1', '2026-03-21', 75000, 'Ofertas Locales — anticipo desarrollo web', { customer: 'ofertas-locales', subscription: 'ofertas-custom', counterparty: 'Ariel Pablo Wawrzyniak', receipts: [receipt('AC76E107692D4654CB91A2227BF18CEB')] }),
  operation('ofertas-2', '2026-03-25', 75000, 'Ofertas Locales — saldo desarrollo web', { customer: 'ofertas-locales', subscription: 'ofertas-custom', counterparty: 'Ariel Pablo Wawrzyniak', receipts: [receipt('AC79E01FAC209CDEB8044A93966CA80F')], externalData: { receivedByTeamMember: true } }),
  operation('mrasport', '2026-03-25', 30000, 'Mrasport25 — Tienda Online anual', { customerId: 44, subscriptionId: 40, category: 'Membresías', counterparty: 'Martín Roberto Alcaraz', receipts: [receipt('A51335CE4641BD5B14AC3BE5E5AF8D6B')] }),
  operation('lr-personalizado', '2026-03-25', 22500, 'LR Todo Personalizado — cuota Combo', { customerId: 45, subscriptionId: 41, category: 'Membresías', receipts: [receipt('4ADEC44D7068A2CFAE2B')] }),
  operation('ariel-impresion', '2026-04-05', 15000, 'Ariel Olivera — seña Sitio Web', { customerId: 40, subscriptionId: 37, category: 'Membresías', receipts: [receipt('A542EC52D3AD63B54CBC356AF461A5DF')] }),
  operation('grupo-expressa', '2026-04-16', 23000, 'Grupo Expressa — cuota servicio', { customerId: 37, subscriptionId: 34, category: 'Membresías', receipts: [receipt('A59378025D1B7A39CC7D8951A0F1EFA8')] }),
  operation('sf-distribuidora', '2026-04-16', 45000, 'SF Distribuidora — pago Combo', { customerId: 38, subscriptionId: 35, category: 'Membresías', receipts: [receipt('4A4B380FDE8857EA7AF9')] }),
  operation('strukt', '2026-04-17', 30000, 'Strukt SAS — Sitio Web anual', { customerId: 34, subscriptionId: 32, category: 'Membresías', receipts: [receipt('ACA97F6925D312919C4DDE5B173286B6')] }),
  operation('juana-belu', '2026-04-27', 45000, 'Juana / Belu Gusman — pago Combo', { customerId: 31, subscriptionId: 29, category: 'Membresías', receipts: [receipt('ACE6182F66AE352EA6579AC8F08789B1')] }),
  operation('sol-rosa', '2026-05-03', 15000, 'Tu Toque Mágico — cuota Tienda Online', { customerId: 33, subscriptionId: 31, category: 'Membresías', receipts: [receipt('AC872E4971A0318BC0B3A4CFC69571FA')] }),
  operation('emanuel', '2026-05-15', 75000, 'Emanuel Torres — pago de servicio', { customerId: 46, subscriptionId: 42, receipts: [receipt('ACBBE24D826B1EE465AB1D238F0FC0E3')], description: 'El importe y el pago están confirmados; el concepto exacto tiene confianza media.' }),
  operation('copa-1', '2026-05-28', 30000, 'Vinos del Dique — primer pago', { customerId: 15, subscriptionId: 14, category: 'Membresías', receipts: [receipt('ACDB9A75194228E5CD989E643ADBA161')] }),
  operation('copa-2', '2026-06-05', 30000, 'Vinos del Dique — segundo pago', { customerId: 15, subscriptionId: 14, category: 'Membresías', receipts: [receipt('ACF2D182DBFB2C829CDB28A131BFB827')] }),
  operation('brenda-30', '2026-06-14', 30000, 'Casa Vidita’s — gestión mensual', { customerId: 68, subscription: 'brenda-ads', category: 'Publicidad y pauta', receipts: [receipt('A5101004795D2B23D6FDCC6C2A361260')] }),
  operation('brenda-70', '2026-06-15', 70000, 'Casa Vidita’s — servicios y publicidad', { customerId: 68, subscription: 'brenda-ads', category: 'Publicidad y pauta', receipts: [receipt('A53E66302653AEDAFD1DB54FC9F4C8FB')], description: 'Ingreso confirmado; distribución exacta entre gestión y pauta no determinada.' }),
  operation('brenda-15', '2026-06-17', 15000, 'Casa Vidita’s — fondos para publicidad', { customerId: 68, subscription: 'brenda-ads', category: 'Publicidad y pauta', receipts: [receipt('A5BD0A1E897E257DFB1ACB13430D3F73')] }),
  operation('brenda-100', '2026-07-13', 100000, 'Casa Vidita’s — servicio y publicidad mensual', { customerId: 68, subscription: 'brenda-ads', category: 'Publicidad y pauta', receipts: [receipt('A5915B957E79D329ADDD2ACB9F2DE32E')], description: 'Ingreso confirmado; distribución exacta entre servicio y pauta no determinada.' }),
  operation('loly', '2026-06-30', 40000, 'Colección Flor de Loto — Tienda Online anual', { customerId: 10, subscriptionId: 9, category: 'Membresías', receipts: [receipt('3A5E9D66E2B38C2CC6C4')] }),
  operation('jesi-aridos', '2026-07-02', 30000, 'Áridos Campos — seña Combo', { customerId: 8, subscriptionId: 7, category: 'Membresías', receipts: [receipt('AC0EEB082645060139809BC6454B113B')] }),
  operation('diego-shocktv', '2026-04-01', 25000, 'ShockTV — seña desarrollo streaming', { customer: 'diego-shocktv', subscription: 'diego-custom', category: 'Desarrollo a medida', counterparty: 'Diego Sebastián García', receipts: [receipt('AC0CFDF0682248EF2FB4A085E923D1F6')], description: 'Proyecto posteriormente cancelado; la seña fue efectivamente recibida por un miembro del equipo.' }),
  operation('eze-hotmart', '2026-04-06', 20000, 'Eze Usay — ampliación web Hotmart', { customer: 'eze-usay', subscription: 'eze-hotmart', category: 'Desarrollo a medida', receipts: [receipt('4AA79597BC66C6242963')] }),
  operation('luz-site', '2026-04-16', 75000, 'María Luz Genovese — seña Sitio Web Profesional', { customer: 'maria-luz', subscription: 'luz-site', category: 'Membresías', receipts: [receipt('A523A18E0CD163AD8A729872006CD0A1')] }),
  operation('gonsanz-custom', '2026-07-02', 60000, 'GONSANZ — adelanto desarrollo personalizado', { customer: 'gonsanz', subscription: 'gonsanz-custom', category: 'Desarrollo a medida', receipts: [receipt('A5E2E3A9D2E925A6076F9F64AF28D33A')] }),
  operation('focuson', '2026-07-23', 100000, 'Óptica Focus On — seña proyecto web', { customer: 'focuson', subscription: 'focuson-web', category: 'Desarrollo a medida', receipts: [receipt('3EB062961E0C7370ED7C08')] }),
  operation('eme-joyas', '2026-07-23', 20000, 'e.M.e Joyas — seña Tienda Online', { customer: 'eme-joyas', subscription: 'eme-store', category: 'Membresías', receipts: [receipt('ACDBF5A88F4D9178C788EADC6FD212CC')] }),
  operation('kairos', '2026-07-29', 50000, 'Kairós Products — seña Combo', { customer: 'kairos', subscription: 'kairos-combo', category: 'Membresías', receipts: [receipt('AC31CAEB8BD8006E5472DCCA10266B26')] }),
  operation('lear', '2026-08-03', 30000, 'LEAR Espejos — cuota Combo', { customer: 'lear-espejos', subscription: 'lear-combo', category: 'Membresías', receipts: [receipt('A5FCA3796F1713EF74902C1EA011563D')] }),
  operation('pablo-80', '2026-04-08', 80000, 'Paseos Devoto — fondos de campaña', { customerId: 60, subscription: 'pablo-ads', category: 'Publicidad y pauta', receipts: [receipt('A556F17F687C5BBC06AD066435520AAF')] }),
  operation('pablo-85', '2026-04-16', 85000, 'Paseos Devoto — gestión y presupuesto publicitario', { customerId: 60, subscription: 'pablo-ads', category: 'Publicidad y pauta', receipts: [receipt('A5CA700349AC976E28ED213C7F726CD1')], description: 'No se divide entre gestión y pauta porque no existe una regla verificable para hacerlo.' }),
  operation('pablo-chatbot', '2026-04-18', 55000, 'Paseos Devoto — desarrollo chatbot WhatsApp', { customerId: 60, category: 'Desarrollo a medida', receipts: [receipt('A58F65A80DC59645C866509164598FC8')] }),
  operation('pablo-system', '2026-04-26', 200000, 'Paseos Devoto — sistema de gestión personalizado', { customerId: 60, category: 'Desarrollo a medida', receipts: [receipt('A58CCBA49A59915D28E930236C732CBD')] }),
  operation('pablo-975', '2026-05-06', 97500, 'Paseos Devoto — pauta e impuesto Meta', { customerId: 60, subscription: 'pablo-ads', category: 'Publicidad y pauta', receipts: [receipt('A5BDE93E3D2F5EDBFD77E41DDA6721F0')], description: 'ARS 75.000 de pauta y ARS 22.500 de impuesto, según el contexto explícito.' }),
  operation('volanteo-1', '2026-06-03', 25000, 'Volanteo Digital — proyecto web sin cliente final identificado', { customer: 'volanteo', subscription: 'volanteo-service', counterparty: 'Francisco Javier Riquelme', receipts: [receipt('A5BB830FF41311C236E51BD20EE9E519')], description: 'No se atribuye a AaissQueen ni Dragmotos porque el chat no aporta evidencia suficiente.' }),
  operation('volanteo-north', '2026-06-05', 25000, 'North Maquinarias — pago Sitio Web', { customerId: 18, subscriptionId: 17, category: 'Membresías', counterparty: 'Francisco Javier Riquelme', receipts: [receipt('A5786E67932269C978A51319AF36CF32')] }),
  operation('volanteo-3', '2026-06-09', 25000, 'Volanteo Digital — proyecto web sin cliente final identificado', { customer: 'volanteo', subscription: 'volanteo-service', counterparty: 'Francisco Javier Riquelme', receipts: [receipt('A5584B61DE8B83CF8A3E9AC78C5BA719')], description: 'No se atribuye a AaissQueen ni Dragmotos porque el chat no aporta evidencia suficiente.' }),
];

operations.push(
  operation('martin-ads-20260508', '2026-05-08', 25000, 'STL Construcciones — anticipo gestión de campaña', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('AC210BDA969D99CDD0C3F97259EF80F6')] }),
  operation('martin-ads-20260515', '2026-05-14', 25000, 'STL Construcciones — saldo gestión de campaña', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('AC1D421FB017EF0704DCEA97D55E03E9')] }),
  operation('martin-ads-20260516', '2026-05-16', 32500, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('AC2FBAF1259A4A3F74C64EEECAF7499C'), receipt('A5BF7930957DB6C561FE7DCB49EAE2C3', ['duplicado', 'nono', 'prueba-bot']), receipt('ACAD218D4D4B448903E2CB8C7DD8F068', ['duplicado', 'nono', 'prueba-bot']), receipt('ACD14A859A856BF86D0D5B2FF7F57C40', ['duplicado', 'nono', 'prueba-bot'])], description: 'El original está en el chat comercial de Martín con contexto explícito de Meta Ads. Las copias de Nono fueron reutilizadas durante una prueba del bot; no corresponden a Estética Marisol.' }),
  operation('martin-ads-20260526', '2026-05-26', 20000, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('A58DB050BC855CC277959DF6D4294B4F')] }),
  operation('martin-ads-20260607', '2026-06-07', 20000, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('A5461D419646ECD10AD9259362B06BFF')] }),
  operation('martin-ads-20260610', '2026-06-10', 15000, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('A5DCF3258200F29892166B10AF3DD981')] }),
  operation('martin-ads-20260629', '2026-06-29', 10000, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('A5A49E48233F5D65B99A4043A5CE83BB')] }),
  operation('martin-ads-20260630', '2026-06-29', 14000, 'STL Construcciones — fondos Meta Ads', { customer: 'martin-stl', subscription: 'martin-ads', category: 'Publicidad y pauta', counterparty: 'Martin Horacio Molina', receipts: [receipt('A55B231253626C31BA9CC7820EE3A4B1')] }),
);

const martinExpenses = [
  ['20260512', '2026-05-12', 10000, ['A54976F9FA0DA17CA031394D96F85D03']],
  ['20260516', '2026-05-16', 60000, ['A556D91928DBE92BECC63F92AB570B1F', 'A50DC32FD89F57CE15C3671E64B8A8B5', 'AC333DD5E05F252F9569A0FEB89E1F2C']],
  ['20260520', '2026-05-20', 20000, ['A5F98F5E6905B9791331E64DAA3B9CBF']],
  ['20260528', '2026-05-28', 3000, ['A503FE2F56724C3175AC21781722D140']],
  ['20260531', '2026-05-31', 50000, ['A5F4DC29BD17D3D2E18EAA6790FA666E']],
  ['20260603', '2026-06-03', 150000, ['A51BFBBDA9D6A91F23C56DA9F348A57D']],
  ['20260605', '2026-06-05', 3000, ['A519303F420E47C2B489E8BA63AC1F45']],
  ['20260609a', '2026-06-09', 1000, ['A5FEC2CE926AD5F3AD897A64E57E6BB3', 'A5E04E09DBFDC6B925E675F78BF3B70D']],
  ['20260609b', '2026-06-09', 30000, ['A5EF9E71570A029274AE7F0C9C56ACB9']],
  ['20260610', '2026-06-10', 1000, ['A5F2E2EED3DDB8D2C0CDAB58E5C54FFB', 'A519E61626FD4A98D0725423DE5CB933']],
  ['20260617', '2026-06-17', 60000, ['A576D985B2CC0461F9A4512AAFFF4E1F']],
  ['20260618', '2026-06-18', 30000, ['A5BAFE7EE41CA04E2B28278532C84ADA']],
  ['20260622', '2026-06-22', 120000, ['A5F798834406B4B4C65060EC459217B6']],
  ['20260629', '2026-06-29', 20000, ['A5660A1E1ABA7B7EC2BE71B9FB278039']],
  ['20260701', '2026-07-01', 5000, ['A5F8026B962896888A0EF38AD9385EB5', 'A5E071464118D7E9915C3FF0AD5B270F']],
  ['20260702', '2026-07-02', 60000, ['A5948453C61EFABE72C59973EE855941', 'A5767FBB3F2F0C58C9C4535B65925A34']],
  ['20260703a', '2026-07-03', 60000, ['A584F503F94F52C1D3E6C72AC7D37F84']],
  ['20260703b', '2026-07-03', 3000, ['A573C4E3BE94F0311B32FDF44B82F919']],
  ['20260704a', '2026-07-04', 2000, ['A55C008F7D8C89E1B8E6A7B8EAE1B129']],
  ['20260704b', '2026-07-04', 29100, ['A521D9936339AAE3B58B905D4AFBF9E1']],
  ['20260709', '2026-07-09', 20000, ['A5EA3ECCF33386AF5566CBADC0CF5E37']],
  ['20260717', '2026-07-17', 25000, ['A57C57A5D103944234E9FCD4B0283F9F']],
  ['20260722', '2026-07-22', 50000, ['A5C7AEC6E5BF9EE39798B9D231E53A28']],
  ['20260723a', '2026-07-23', 50000, ['A5571EC1895D220ED37B52469EC75F30']],
  ['20260723b', '2026-07-23', 75000, ['A51750E4E803480E44392E1728BD9F7B']],
  ['20260728', '2026-07-28', 75000, ['A58E48890ADE1F4E7F8B654D9C70EE85']],
  ['20260730', '2026-07-30', 70000, ['A5A324599D86420D307B7718F2AE46F0']],
  ['20260803', '2026-08-03', 6000, ['A559CA1DE6C212BB1F4312B056CCF61A']],
  ['20260804a', '2026-08-04', 1000, ['A531A9B2C1C91A986BCD52976FB83CF0']],
  ['20260804b', '2026-08-04', 5000, ['A5BC0D3ED39A8F94DC6C9DD0B47DD3D5']],
  ['20260805a', '2026-08-05', 5000, ['A5B36AB1D6C3424057AB7EE021C234FC']],
  ['20260805b', '2026-08-05', 126000, ['A56F2F2A573D6209FD3458CBF519B76A']],
  ['20260805c', '2026-08-05', 2000, ['A54355704490D6141F1AC51541700E09']],
  ['20260807', '2026-08-07', 50000, ['A506838045D141621A3700BEE7E543F4']],
];

for (const [key, date, amount, ids] of martinExpenses) {
  operations.push(operation(`equipo-martin-${key}`, date, amount, `Liquidación de equipo — Martín — ${date}`, {
    type: 'expense', category: 'Liquidaciones de equipo', counterparty: 'Martin Andres Insaurralde',
    receipts: ids.map((id, index) => receipt(id, index ? ['duplicado'] : [])), tags: ['equipo', 'martin-dev', 'transferencia'],
    description: 'Movimiento interno del equipo; no corresponde a un cliente ni a una membresía comercial.',
  }));
}

operations.push(
  operation('familia-susana-20260518', '2026-05-18', 24000, 'Ayuda familiar — Susana Samaniego', { type: 'expense', category: 'Ayuda familiar', counterparty: 'Susana Monica Samaniego', receipts: [receipt('A5C80825B0772C76F58714A0BF127B7F'), receipt('A5CC8E202F358334CB99ABEFBCCFBC62', ['duplicado'])], tags: ['familia', 'transferencia'], description: 'Movimiento familiar/personal; no se vincula a la membresía comercial homónima.' }),
  operation('familia-susana-20260619', '2026-06-19', 1000, 'Ayuda familiar — Susana Samaniego', { type: 'expense', category: 'Ayuda familiar', counterparty: 'Susana Monica Samaniego', receipts: [receipt('A557B6E3C15E87BD550CB012E220B17C')], tags: ['familia', 'transferencia'], description: 'Movimiento familiar/personal; no se vincula a una membresía comercial.' }),
  operation('equipo-reintegro-20260718', '2026-07-18', 15000, 'Reintegro/aporte del equipo — Martín', { category: 'Reintegros de equipo', counterparty: 'Martin Andres Insaurralde', receipts: [receipt('AC7A4A4FF7AB3A391F45496539ECF091'), receipt('AC5345AFD12AB4E95960BDC6B1CCAF33', ['soporte-sin-impacto'])], tags: ['equipo', 'reintegro', 'transferencia'], description: 'Ingreso de Martín a Noelia. El PDF adicional muestra el paso previo Martín→Martín y se conserva solo como soporte.' }),
  operation('equipo-aporte-20260719', '2026-07-19', 400000, 'Aporte/reintegro del equipo — Martín', { category: 'Reintegros de equipo', counterparty: 'Martin Andres Insaurralde', receipts: [receipt('ACDB648A383047109457407054B05D60')], tags: ['equipo', 'aporte', 'transferencia'], description: 'Transferencia completada; el contexto no permite clasificarla como venta.' }),
  operation('equipo-prestamo-20260731', '2026-07-31', 5000, 'Préstamo personal/equipo — Martín', { category: 'Reintegros de equipo', counterparty: 'Martin Andres Insaurralde', receipts: [receipt('AC193953C1C4229A5E655EDF415129F7')], tags: ['equipo', 'prestamo', 'transferencia'] }),
  operation('didi-pagado-equipo', '2026-06-11', 4000, 'Transporte Didi — pagado por Martín', { type: 'expense', category: 'Transporte', counterparty: 'Coronel Carlos Miguel', receipts: [receipt('AC0D622B1BBA9EC915F2AF50AEA78B0B')], tags: ['equipo', 'transporte', 'didi'], description: 'Gasto devengado del traslado de Noelia, pagado directamente por un miembro del equipo.', externalData: { cashImpact: false, paidByTeamMember: true } }),
  operation('claude-202606', '2026-06-03', 20, 'Claude — suscripción mensual', { type: 'expense', currency: 'USD', category: 'Software / IA', counterparty: 'Anthropic, PBC', recurrence: 'monthly', nextDueOn: '2026-07-03', receipts: [receipt('ACEC631BD9749FC4E5A6FED5F19272D4'), receipt('ACB4098D862B4900C37E3B463AFC8DD4', ['soporte'])], tags: ['equipo', 'saas', 'claude', 'recurrente'], description: 'Factura pagada de Claude/Anthropic; renovación automática mensual.' }),
  operation('redlam-202604', '2026-04-14', 25000, 'RedLAM — servicio de internet', { type: 'expense', category: 'Internet y conectividad', counterparty: 'RedLAM', receipts: [receipt('A527F56158D5451CCC0D119A76886581')], tags: ['proveedor', 'internet', 'recurrente'] }),
  operation('redlam-202607', '2026-07-14', 25000, 'RedLAM — servicio de internet', { type: 'expense', category: 'Internet y conectividad', counterparty: 'RedLAM', recurrence: 'monthly', nextDueOn: '2026-08-14', receipts: [receipt('A56B1007C2B81F884A20A7C5F89F1FA2'), receipt('A5DBDF148DA63591C24188ECECA2E7E0', ['duplicado'])], tags: ['proveedor', 'internet', 'recurrente'] }),
  operation('pendiente-equipo-30', '2026-07-14', 30000, 'Transferencia pendiente a Noelia — ARS 30.000', { status: 'pending', category: 'Transferencias pendientes', counterparty: 'Remitente no visible', receipts: [receipt('AC00DCCAFAEF791A889653E8C14F63B7')], tags: ['equipo', 'pendiente', 'transferencia'], description: 'El comprobante indica estado pendiente; no se suma a caja.' }),
  operation('pendiente-equipo-70', '2026-07-14', 70000, 'Transferencia pendiente de Martín a Noelia', { status: 'pending', category: 'Transferencias pendientes', counterparty: 'Martin Andres Insaurralde', receipts: [receipt('ACE8B9FF34117CEC68292B50FE2CF6D4')], tags: ['equipo', 'pendiente', 'transferencia'], description: 'El comprobante indica estado pendiente; no se suma a caja.' }),
  operation('pendiente-interno-aapp-28', '2026-05-22', 28000, 'Transferencia interna pendiente — internet', { status: 'pending', category: 'Transferencias pendientes', counterparty: 'Martin Andres Insaurralde', receipts: [receipt('ACFA39AFA721A4E43AE05849230DE7CA')], tags: ['equipo', 'pendiente', 'internet'], description: 'Pase interno pendiente para pagar internet; no es ingreso de cliente ni se suma a caja.' }),
  operation('rechazado-analia', '2026-05-22', 5000, 'Comprobante rechazado — destinataria incorrecta', { status: 'cancelled', category: 'Comprobante rechazado', counterparty: 'Analia Marcela Soto', receipts: [receipt('AC5BB5F8F3E1ED7593C5310AC08ED889')], tags: ['rechazado', 'destinatario-incorrecto'], description: 'El dinero fue enviado a una destinataria ajena al equipo. Se conserva para auditoría, sin afectar ingresos.' }),
  operation('rechazado-gonzalo', '2026-07-14', 85780, 'Comprobante rechazado — Gonzalo Aguilar', { status: 'cancelled', category: 'Comprobante rechazado', counterparty: 'Gonzalo Agustín Aguilar', receipts: [receipt('3AD908C40F70E4DF9622')], tags: ['rechazado', 'destinatario-incorrecto'], description: 'Destinatario e importe/producto no coinciden; no se vincula a los customers duplicados de Gonzalo.' }),
);

function fileNameFor(media) {
  const label = (media.media_caption || media.text || '').trim();
  if (/\.(?:pdf|png|jpe?g|webp)$/i.test(label)) return label.slice(0, 255);
  try {
    return decodeURIComponent(new URL(media.media_url, 'https://local.invalid').pathname.split('/').filter(Boolean).pop() || '').slice(0, 255);
  } catch {
    return `comprobante-${media.timestamp.toISOString().slice(0, 10)}`;
  }
}

async function main() {
  const [user] = await sql`select id, email from users where lower(email) = 'noelia@whatspro.uno' limit 1`;
  if (!user) throw new Error('No se encontró noelia@whatspro.uno.');
  const [membership] = await sql`select id from team_members where team_id = ${TEAM_ID} and user_id = ${user.id} limit 1`;
  const [financeEnabled] = await sql`select id from team_member_plugins where team_id = ${TEAM_ID} and user_id = ${user.id} and plugin_id = 'finance' and enabled = true limit 1`;
  if (!membership || !financeEnabled) throw new Error('El equipo/Financiero de Noelia no está habilitado como se esperaba.');

  const expectedReceipts = operations.reduce((total, item) => total + item.receipts.length, 0);
  const uniqueMessageIds = new Set(operations.flatMap((item) => item.receipts.map((itemReceipt) => itemReceipt.id)));
  if (uniqueMessageIds.size !== expectedReceipts) throw new Error('Un message_id aparece en más de una operación del lote.');

  await sql.begin(async (tx) => {
    const customerIds = new Map();
    const customerContactIds = new Map();

    for (const customer of customers) {
      const [row] = await tx`
        insert into team_customers (
          team_id, name, email, phone, source, external_id, external_data, status, notes,
          created_by, updated_by, created_at, updated_at
        ) values (
          ${TEAM_ID}, ${customer.name}, ${customer.email || null}, ${customer.phone || null}, ${AUDIT_SOURCE}, ${customer.key},
          ${tx.json({ chatId: customer.chatId, auditSource: AUDIT_SOURCE })}, ${customer.status || 'active'}, ${customer.notes},
          ${user.id}, ${user.id}, now(), now()
        )
        on conflict (team_id, source, external_id) do update set
          name = excluded.name,
          email = excluded.email,
          phone = excluded.phone,
          status = excluded.status,
          external_data = excluded.external_data,
          notes = excluded.notes,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning id`;
      customerIds.set(customer.key, row.id);

      let contactId = customer.contactId;
      if (!contactId) {
        const [contact] = await tx`select id from contacts where team_id = ${TEAM_ID} and chat_id = ${customer.chatId} limit 1`;
        contactId = contact?.id ?? null;
      }
      if (contactId) {
        const [validContact] = await tx`select id from contacts where id = ${contactId} and team_id = ${TEAM_ID} limit 1`;
        if (!validContact) throw new Error(`Contacto inválido ${contactId} para customer ${customer.key}.`);
        customerContactIds.set(customer.key, contactId);
        await tx`
          insert into team_customer_contacts (team_id, customer_id, contact_id, created_at)
          values (${TEAM_ID}, ${row.id}, ${contactId}, now())
          on conflict (customer_id, contact_id) do nothing`;
      }
    }

    for (const [contactId, customerId] of contactLinks) {
      const [valid] = await tx`
        select c.id contact_id, tc.id customer_id
        from contacts c cross join team_customers tc
        where c.id = ${contactId} and c.team_id = ${TEAM_ID}
          and tc.id = ${customerId} and tc.team_id = ${TEAM_ID}`;
      if (!valid) throw new Error(`Relación contacto/customer inválida: ${contactId}/${customerId}.`);
      await tx`
        insert into team_customer_contacts (team_id, customer_id, contact_id, created_at)
        values (${TEAM_ID}, ${customerId}, ${contactId}, now())
        on conflict (customer_id, contact_id) do nothing`;
    }

    const subscriptionIds = new Map();
    for (const subscription of subscriptions) {
      const customerId = subscription.customerId ?? customerIds.get(subscription.customer);
      if (!customerId) throw new Error(`No se pudo resolver customer de ${subscription.key}.`);
      const contactId = subscription.customer ? (customerContactIds.get(subscription.customer) ?? null) : null;
      const [row] = await tx`
        insert into team_membership_subscriptions (
          team_id, subscription_number, plan_id, company_id, customer_id, contact_id,
          external_source, external_id, plan_name_snapshot, price, currency, billing_type,
          status, payment_status, start_date, end_date, reminders_sent, notes,
          created_by, updated_by, created_at, updated_at
        ) values (
          ${TEAM_ID}, ${subscription.number}, ${subscription.planId}, ${subscription.companyId}, ${customerId}, ${contactId},
          ${AUDIT_SOURCE}, ${subscription.key}, ${subscription.name}, ${subscription.price}, 'ARS', ${subscription.billingType},
          ${subscription.status}, ${subscription.paymentStatus}, ${subscription.startDate}, ${subscription.endDate}, '[]'::jsonb,
          ${`Asignación creada por auditoría de comprobantes (${AUDIT_SOURCE}).`},
          ${user.id}, ${user.id}, now(), now()
        )
        on conflict (team_id, external_source, external_id) do update set
          plan_id = excluded.plan_id,
          company_id = excluded.company_id,
          customer_id = excluded.customer_id,
          contact_id = excluded.contact_id,
          plan_name_snapshot = excluded.plan_name_snapshot,
          price = excluded.price,
          currency = excluded.currency,
          billing_type = excluded.billing_type,
          status = excluded.status,
          payment_status = excluded.payment_status,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning id`;
      subscriptionIds.set(subscription.key, row.id);
    }

    const existingSubscriptionCache = new Map();
    async function existingSubscription(id) {
      if (!existingSubscriptionCache.has(id)) {
        const [row] = await tx`
          select id, customer_id, company_id, plan_id
          from team_membership_subscriptions
          where id = ${id} and team_id = ${TEAM_ID} limit 1`;
        if (!row) throw new Error(`Suscripción existente inválida: ${id}.`);
        existingSubscriptionCache.set(id, row);
      }
      return existingSubscriptionCache.get(id);
    }

    for (const item of operations) {
      let customerId = item.customerId ?? (item.customer ? customerIds.get(item.customer) : null) ?? null;
      let subscriptionId = item.subscriptionId ?? (item.subscription ? subscriptionIds.get(item.subscription) : null) ?? null;
      let companyId = null;
      let planId = null;
      if (subscriptionId) {
        const relation = item.subscriptionId
          ? await existingSubscription(subscriptionId)
          : subscriptions.find((candidate) => candidate.key === item.subscription);
        if (!relation) throw new Error(`No se pudo resolver la suscripción de ${item.key}.`);
        customerId ??= relation.customer_id ?? relation.customerId ?? (relation.customer ? customerIds.get(relation.customer) : null) ?? null;
        companyId = relation.company_id ?? relation.companyId ?? null;
        planId = relation.plan_id ?? relation.planId ?? null;
      }

      const externalData = {
        auditSource: AUDIT_SOURCE,
        classificationReviewed: true,
        cashImpact: item.status === 'paid' && item.externalData?.cashImpact !== false,
        evidenceMessageIds: item.receipts.map((itemReceipt) => itemReceipt.id),
        ...(item.externalData || {}),
      };
      const paidOn = item.status === 'paid' ? item.date : null;
      const [entry] = await tx`
        insert into team_financial_entries (
          team_id, type, title, description, category, amount, currency, status,
          occurred_on, due_on, paid_on, recurrence, recurrence_end_on, next_due_on,
          payment_method, counterparty, customer_id, company_id, plan_id, subscription_id,
          external_source, external_id, external_data, created_by, updated_by, created_at, updated_at
        ) values (
          ${TEAM_ID}, ${item.type}, ${item.title}, ${item.description || ''}, ${item.category}, ${item.amount}, ${item.currency}, ${item.status},
          ${item.date}, null, ${paidOn}, ${item.recurrence}, null, ${item.nextDueOn || null},
          ${item.paymentMethod}, ${item.counterparty}, ${customerId}, ${companyId}, ${planId}, ${subscriptionId},
          ${AUDIT_SOURCE}, ${item.key}, ${tx.json(externalData)}, ${user.id}, ${user.id}, now(), now()
        )
        on conflict (team_id, external_source, external_id) do update set
          type = excluded.type,
          title = excluded.title,
          description = excluded.description,
          category = excluded.category,
          amount = excluded.amount,
          currency = excluded.currency,
          status = excluded.status,
          occurred_on = excluded.occurred_on,
          paid_on = excluded.paid_on,
          recurrence = excluded.recurrence,
          next_due_on = excluded.next_due_on,
          payment_method = excluded.payment_method,
          counterparty = excluded.counterparty,
          customer_id = excluded.customer_id,
          company_id = excluded.company_id,
          plan_id = excluded.plan_id,
          subscription_id = excluded.subscription_id,
          external_data = excluded.external_data,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning id`;

      for (const [index, itemReceipt] of item.receipts.entries()) {
        const [media] = await tx`
          select m.id, m.chat_id, m.timestamp, m.text, m.media_caption, m.media_url, m.media_mimetype
          from messages m join chats ch on ch.id = m.chat_id
          where m.id = ${itemReceipt.id} and ch.team_id = ${TEAM_ID} limit 1`;
        if (!media?.media_url) throw new Error(`No existe media válida para ${itemReceipt.id} (${item.key}).`);
        const tags = [...new Set([...item.tags, ...itemReceipt.extraTags, ...(index > 0 && !itemReceipt.extraTags.includes('soporte') ? ['duplicado'] : [])])];
        const receiptNotes = [
          item.description || `Clasificado como ${item.category}.`,
          itemReceipt.extraTags.includes('duplicado') ? 'Copia del mismo movimiento; no genera un segundo asiento.' : '',
          itemReceipt.extraTags.includes('soporte-sin-impacto') ? 'Soporte previo sin impacto propio en caja.' : '',
        ].filter(Boolean).join(' ');
        await tx`
          insert into team_financial_receipts (
            team_id, entry_id, message_id, chat_id, media_url, mime_type, file_name,
            document_date, payment_date, tags, notes, created_by, created_at, updated_at
          ) values (
            ${TEAM_ID}, ${entry.id}, ${media.id}, ${media.chat_id}, ${media.media_url}, ${media.media_mimetype}, ${fileNameFor(media)},
            ${item.date}, ${paidOn}, ${tx.json(tags)}, ${receiptNotes}, ${user.id}, now(), now()
          )
          on conflict (team_id, message_id) do update set
            entry_id = excluded.entry_id,
            chat_id = excluded.chat_id,
            media_url = excluded.media_url,
            mime_type = excluded.mime_type,
            file_name = excluded.file_name,
            document_date = excluded.document_date,
            payment_date = excluded.payment_date,
            tags = excluded.tags,
            notes = excluded.notes,
            updated_at = now()`;
      }
    }

    await tx`
      insert into activity_logs (team_id, user_id, action, timestamp, ip_address)
      select ${TEAM_ID}, ${user.id}, 'FINANCE_RECEIPT_AUDIT_IMPORTED', now(), ${`${operations.length}e/${expectedReceipts}r`}
      where not exists (
        select 1 from activity_logs
        where team_id = ${TEAM_ID} and user_id = ${user.id}
          and action = 'FINANCE_RECEIPT_AUDIT_IMPORTED'
          and ip_address = ${`${operations.length}e/${expectedReceipts}r`}
      )`;
  });

  const totals = await sql`
    select type, status, currency, count(*)::int entries, sum(amount)::bigint amount
    from team_financial_entries
    where team_id = ${TEAM_ID} and external_source = ${AUDIT_SOURCE}
    group by type, status, currency
    order by currency, type, status`;
  const [counts] = await sql`
    select
      (select count(*)::int from team_financial_entries where team_id = ${TEAM_ID} and external_source = ${AUDIT_SOURCE}) entries,
      (select count(*)::int from team_financial_receipts r join team_financial_entries e on e.id = r.entry_id where r.team_id = ${TEAM_ID} and e.external_source = ${AUDIT_SOURCE}) receipts,
      (select count(*)::int from team_customers where team_id = ${TEAM_ID} and source = ${AUDIT_SOURCE}) customers,
      (select count(*)::int from team_membership_subscriptions where team_id = ${TEAM_ID} and external_source = ${AUDIT_SOURCE}) subscriptions`;
  if (counts.entries !== operations.length || counts.receipts !== expectedReceipts) {
    throw new Error(`Verificación incompleta: esperado ${operations.length}/${expectedReceipts}, obtenido ${counts.entries}/${counts.receipts}.`);
  }
  console.log(JSON.stringify({ auditSource: AUDIT_SOURCE, counts, totals }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
