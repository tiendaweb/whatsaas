'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import type { MarketplaceItem } from '@/lib/db/schema';

interface AppDetailModalProps {
  app: MarketplaceItem | null;
  isOpen: boolean;
  onClose: () => void;
  isInstalled?: boolean;
  isDefault?: boolean;
  onInstall?: () => Promise<void>;
  onUninstall?: () => Promise<void>;
}

export function AppDetailModal({
  app,
  isOpen,
  onClose,
  isInstalled = false,
  isDefault = false,
  onInstall,
  onUninstall,
}: AppDetailModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleInstall = async () => {
    if (onInstall) {
      setIsLoading(true);
      try {
        await onInstall();
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleUninstall = async () => {
    if (onUninstall) {
      setIsLoading(true);
      try {
        await onUninstall();
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!app) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-4">
              {app.iconUrl && (
                <img
                  src={app.iconUrl}
                  alt={app.title}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
                <DialogTitle className="text-2xl">{app.title}</DialogTitle>
                <DialogDescription className="text-base mt-1">
                  {app.subtitle}
                </DialogDescription>
                <div className="flex gap-2 mt-3">
                  <Badge variant="outline">{app.category}</Badge>
                  {isDefault && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Por Defecto
                    </Badge>
                  )}
                  {isInstalled && !isDefault && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      Instalada
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-lg mb-2">Descripción</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {app.description}
            </p>
          </div>

          {/* Image */}
          {app.imageUrl && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Vista Previa</h3>
              <img
                src={app.imageUrl}
                alt={app.title}
                className="w-full rounded-lg object-cover max-h-96"
              />
            </div>
          )}

          {/* Features */}
          {app.features && app.features.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-3">Características</h3>
              <ul className="space-y-2">
                {app.features.map((feature: any, idx: number) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">
                      ✓
                    </span>
                    <div>
                      <p className="font-medium">{feature.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags */}
          {app.tags && app.tags.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {app.tags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="capitalize">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isDefault ? (
              <div className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-600 dark:text-gray-400">
                Esta aplicación está preinstalada y no puede ser desinstalada
              </div>
            ) : isInstalled ? (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                >
                  Cerrar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleUninstall}
                  disabled={isLoading}
                >
                  {isLoading ? 'Desinstalando...' : 'Desinstalar'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleInstall}
                  disabled={isLoading}
                >
                  {isLoading ? 'Instalando...' : 'Instalar'}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
