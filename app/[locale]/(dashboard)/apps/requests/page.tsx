'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, ThumbsUp, MessageCircle } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

interface FeatureRequest {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  votes: number;
  requestedByUser: { id: number; name: string; email: string } | null;
  createdAt: string;
  app?: { id: number; title: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const CATEGORIES = [
  'Mejoras',
  'Productividad',
  'Automatización',
  'Nodos',
  'Apps',
  'Marketing',
];

export default function FeatureRequestsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [userTeamId, setUserTeamId] = useState<number | null>(null);
  const [userVotes, setUserVotes] = useState<Set<number>>(new Set());

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Mejoras',
  });

  useEffect(() => {
    const fetchTeamAndRequests = async () => {
      try {
        // Get team info from membership
        const membershipResponse = await fetch('/api/team/membership');
        const membershipData = await membershipResponse.json();
        const teamId = membershipData?.teamId;
        setUserTeamId(teamId);

        if (teamId) {
          // Fetch requests
          const requestsResponse = await fetch(
            `/api/features/requests?teamId=${teamId}`
          );
          const requestsData = await requestsResponse.json();
          setRequests(Array.isArray(requestsData) ? requestsData : []);

          // Load user votes from localStorage
          const savedVotes = localStorage.getItem(`feature-request-votes-${teamId}`);
          if (savedVotes) {
            setUserVotes(new Set(JSON.parse(savedVotes)));
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamAndRequests();
  }, []);

  const filteredRequests = requests.filter((request) => {
    const statusMatch =
      filterStatus === 'all' || request.status === filterStatus;
    const categoryMatch =
      filterCategory === 'all' || request.category === filterCategory;
    return statusMatch && categoryMatch;
  });

  const handleCreateRequest = async () => {
    if (!userTeamId || !formData.title.trim() || !formData.description.trim()) {
      alert('Por favor completa todos los campos');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/features/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: userTeamId,
          ...formData,
        }),
      });

      if (response.ok) {
        const newRequest = await response.json();
        setRequests([newRequest, ...requests]);
        setFormData({ title: '', description: '', category: 'Mejoras' });
        alert('Solicitud creada exitosamente');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Error al crear la solicitud');
    } finally {
      setIsCreating(false);
    }
  };

  const handleVote = async (requestId: number) => {
    const alreadyVoted = userVotes.has(requestId);

    try {
      const response = await fetch(
        `/api/features/requests/${requestId}/vote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: alreadyVoted ? 'remove' : 'add',
          }),
        }
      );

      if (response.ok) {
        const newVotes = new Set(userVotes);
        if (alreadyVoted) {
          newVotes.delete(requestId);
        } else {
          newVotes.add(requestId);
        }
        setUserVotes(newVotes);

        // Update localStorage
        if (userTeamId) {
          localStorage.setItem(
            `feature-request-votes-${userTeamId}`,
            JSON.stringify(Array.from(newVotes))
          );
        }

        // Update requests
        const updatedRequest = await fetch(`/api/features/requests/${requestId}`);
        const updatedData = await updatedRequest.json();
        setRequests(
          requests.map((r) => (r.id === requestId ? updatedData : r))
        );
      }
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Solicitudes de Mejoras</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Solicita nuevas funcionalidades y vota por las que te interesan
          </p>
        </div>
      </div>

      {/* Create Request Dialog */}
      <Dialog>
        <DialogTrigger asChild>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            Nueva Solicitud
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar Nueva Mejora</DialogTitle>
            <DialogDescription>
              Comparte tu idea o solicitud de mejora
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input
                placeholder="Ej: Integración con Google Drive"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                placeholder="Describe tu solicitud detalladamente"
                rows={4}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateRequest}
              disabled={isCreating}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isCreating ? 'Creando...' : 'Crear Solicitud'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="reviewed">Revisado</SelectItem>
            <SelectItem value="in_progress">En Progreso</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Cargando solicitudes...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <MessageCircle className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No hay solicitudes disponibles</p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {request.description}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{request.category}</Badge>
                    <Badge
                      className={STATUS_COLORS[request.status] || 'bg-gray-100'}
                    >
                      {request.status === 'in_progress'
                        ? 'En Progreso'
                        : request.status === 'pending'
                          ? 'Pendiente'
                          : request.status === 'reviewed'
                            ? 'Revisado'
                            : request.status === 'completed'
                              ? 'Completado'
                              : 'Rechazado'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500">
                    {request.requestedByUser?.name} •{' '}
                    {new Date(request.createdAt).toLocaleDateString('es-ES')}
                  </div>
                  <Button
                    variant={userVotes.has(request.id) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleVote(request.id)}
                    className="gap-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    {request.votes}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
