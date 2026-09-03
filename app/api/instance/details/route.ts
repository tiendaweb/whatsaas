import { NextResponse } from 'next/server';
import { getTeamForUser } from '@/lib/db/queries';
import { fetchInstanceLiveDetails, listTeamInstances } from '@/lib/instances/live-status';

type InstanceDetailItem = {
    dbId: number;
    instanceName: string;
    evolutionInstanceId: string | null;
    number: string | null;
    integration: string | null;
    owner: string | null;
    profileName: string | null;
    profilePictureUrl: string | null;
    status: string;
    token: string | null;
};

export async function GET(request: Request) {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbInstances = await listTeamInstances(team.id);

    if (dbInstances.length === 0) {
      return NextResponse.json([]);
    }

    const results = await Promise.all(dbInstances.map(async (dbInstance) => {
        const live = await fetchInstanceLiveDetails(dbInstance);

        if (live.status !== 'not_found') {
            return {
                dbId: dbInstance.id,
                instanceName: dbInstance.instanceName,
                evolutionInstanceId: dbInstance.evolutionInstanceId,
                status: live.status,
                token: dbInstance.accessToken,
                owner: live.owner,
                profileName: live.profileName,
                number: live.number,
                integration: live.integration,
                profilePictureUrl: live.profilePictureUrl,
            } as InstanceDetailItem;
        }
        return null;
    }));

    const instanceDetailsList = results.filter((item): item is InstanceDetailItem => item !== null);

    return NextResponse.json(instanceDetailsList);

  } catch (error: any) {
    console.error('Error fetching instance details:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
