'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppDetailModal } from '@/components/apps/AppDetailModal';
import { Heart, Search, Plus } from 'lucide-react';
import type { MarketplaceItem } from '@/lib/db/schema';
import { useRouter } from '@/i18n/routing';

const CATEGORIES = [
  'Mejoras',
  'Productividad',
  'Automatización',
  'Nodos',
  'Apps',
  'Marketing',
  'Herramientas',
];

export default function AppsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [apps, setApps] = useState<MarketplaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<MarketplaceItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Mejoras');

  useEffect(() => {
    fetchApps();
  }, []);

  async function fetchApps() {
    try {
      setIsLoading(true);
      const response = await fetch('/api/plugins/marketplace/items');
      const data = await response.json();
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching apps:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = app.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const defaultApps = apps.filter((app) => app.isDefault);

  const handleAppClick = (app: MarketplaceItem) => {
    setSelectedApp(app);
    setIsModalOpen(true);
  };

  const handleViewRequests = () => {
    router.push('/apps/requests');
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">APPS</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona y descubre nuevas aplicaciones para tu equipo
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleViewRequests}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Solicitar Mejora
        </Button>
      </div>

      {/* Default Apps Section */}
      {defaultApps.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Apps Preinstaladas</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Estas aplicaciones vienen incluidas por defecto
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defaultApps.map((app) => (
              <Card
                key={app.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleAppClick(app)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{app.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {app.subtitle}
                      </CardDescription>
                    </div>
                    {app.iconUrl && (
                      <img
                        src={app.iconUrl}
                        alt={app.title}
                        className="w-10 h-10 rounded-lg ml-2"
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Por Defecto
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search and Tabs */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar apps..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="w-full justify-start overflow-x-auto">
            {CATEGORIES.map((category) => {
              const count = apps.filter(
                (app) => app.category === category && !app.isDefault
              ).length;
              return (
                <TabsTrigger key={category} value={category} className="whitespace-nowrap">
                  {category}
                  {count > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORIES.map((category) => (
            <TabsContent key={category} value={category} className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Cargando apps...</p>
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">No hay apps disponibles</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredApps.map((app) => (
                    <Card
                      key={app.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden group"
                      onClick={() => handleAppClick(app)}
                    >
                      {app.imageUrl && (
                        <div className="h-32 overflow-hidden bg-gray-100 dark:bg-gray-800">
                          <img
                            src={app.imageUrl}
                            alt={app.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                      )}
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{app.title}</CardTitle>
                            <CardDescription className="mt-1">
                              {app.subtitle}
                            </CardDescription>
                          </div>
                          {app.iconUrl && !app.imageUrl && (
                            <img
                              src={app.iconUrl}
                              alt={app.title}
                              className="w-10 h-10 rounded-lg"
                            />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {app.description}
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                          <Badge variant="outline" className="text-xs">
                            {app.category}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppClick(app);
                            }}
                            className="text-xs h-8"
                          >
                            Ver Detalles →
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Modal */}
      <AppDetailModal
        app={selectedApp}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedApp(null);
        }}
      />
    </div>
  );
}
