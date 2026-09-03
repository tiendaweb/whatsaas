import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { evolutionInstances } from '@/lib/db/schema';

/**
 * Estado en vivo de una instancia de WhatsApp contra Evolution API.
 *
 * Antes vivía dentro de `GET /api/instance/details`; ahora la route y el
 * conector MCP consultan lo mismo. Devuelve sólo datos de perfil y estado: el
 * token con el que se consulta nunca forma parte del resultado.
 */

const MASTER_API_KEY = process.env.AUTHENTICATION_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

export type InstanceRow = typeof evolutionInstances.$inferSelect;

export type InstanceLiveDetails = {
  /** open | close | connecting | unknown | not_found | error */
  status: string;
  owner: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  number: string | null;
  integration: string | null;
};

export async function listTeamInstances(teamId: number): Promise<InstanceRow[]> {
  return db.query.evolutionInstances.findMany({
    where: eq(evolutionInstances.teamId, teamId),
    orderBy: [asc(evolutionInstances.instanceName)],
  });
}

export async function fetchInstanceLiveDetails(
  dbInstance: Pick<InstanceRow, 'instanceName' | 'evolutionInstanceId' | 'accessToken'>,
  timeoutMs = 10000,
): Promise<InstanceLiveDetails> {
  if (!MASTER_API_KEY) throw new Error('Server configuration incomplete.');

  let status = 'unknown';
  let profileInfo: Partial<InstanceLiveDetails> = { owner: null, profileName: null, profilePictureUrl: null };
  const apiKeyToUse = dbInstance.accessToken || MASTER_API_KEY;
  const identifier = dbInstance.evolutionInstanceId || dbInstance.instanceName;

  try {
    const stateResponse = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${dbInstance.instanceName}`,
      { headers: { apikey: apiKeyToUse }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) },
    );

    if (stateResponse.ok) {
      const stateData = await stateResponse.json();
      status = stateData.instance?.state || 'unknown';

      if (status === 'open') {
        const detailsResponse = await fetch(
          `${EVOLUTION_API_URL}/instance/fetchInstances?instanceId=${identifier}`,
          { headers: { apikey: apiKeyToUse }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) },
        );
        if (detailsResponse.ok) {
          const detailsArray = await detailsResponse.json();
          if (detailsArray && detailsArray.length > 0) {
            const evoInstance = detailsArray[0];
            profileInfo = {
              owner: evoInstance?.owner || null,
              profileName: evoInstance?.profileName || null,
              profilePictureUrl: evoInstance?.profilePicUrl || null,
              number: evoInstance?.number || null,
              integration: evoInstance?.integration || null,
            };
          }
        }
      }
    } else if (stateResponse.status === 404) {
      status = 'not_found';
    } else {
      status = 'error';
    }
  } catch (fetchError) {
    console.error(`Error fetching data for ${dbInstance.instanceName}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    status = 'error';
  }

  return {
    status,
    owner: profileInfo.owner ?? null,
    profileName: profileInfo.profileName ?? null,
    profilePictureUrl: profileInfo.profilePictureUrl ?? null,
    number: profileInfo.number ?? null,
    integration: profileInfo.integration ?? null,
  };
}
