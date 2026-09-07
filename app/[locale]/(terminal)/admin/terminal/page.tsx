import { getUser } from '@/lib/db/queries';
import { TerminalWorkspace } from '@/components/admin/terminal/TerminalWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Terminales · Developer Command Center' };

export default async function TerminalPage() {
  // El layout ya cerró la puerta; acá sólo se muestra quién es.
  const user = await getUser();
  return <TerminalWorkspace email={user?.email ?? ''} />;
}
