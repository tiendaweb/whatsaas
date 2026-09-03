import { getAllTeams } from '@/lib/db/admin-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DeleteTeamButton } from './delete-team-button';

export default async function AdminTeamsPage() {
  const teams = await getAllTeams();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestión de equipos</h1>
        <Badge variant="outline">{teams.length} equipos</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos los equipos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>{team.planName || 'Gratis'}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={team.subscriptionStatus === 'active' ? 'default' : 'outline'}
                      className={team.subscriptionStatus === 'active' ? 'bg-green-600' : ''}
                    >
                      {team.subscriptionStatus || 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(team.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteTeamButton id={team.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
