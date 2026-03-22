import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslations } from 'next-intl';

interface ServiceWindowTimerProps {
  lastInteraction: string | null;
}

export function ServiceWindowTimer({ lastInteraction }: ServiceWindowTimerProps) {
  const t = useTranslations('Chat');
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!lastInteraction) {
      setIsExpired(true);
      return;
    }

    const calculateTimeLeft = () => {
      const start = new Date(lastInteraction).getTime();
      const end = start + (24 * 60 * 60 * 1000);
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("00:00");
      } else {
        setIsExpired(false);
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 60000); 

    return () => clearInterval(timer);
  }, [lastInteraction]);

  if (!lastInteraction) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2 h-8 rounded-md text-xs font-medium border cursor-help ${
            isExpired 
              ? "bg-destructive/10 text-destructive border-destructive/20" 
              : "bg-primary/10 text-primary border-primary/20"
          }`}>
            {isExpired ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            <span>{isExpired ? t('window_closed_text') : timeLeft}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('service_window_title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('opened_text', { date: new Date(lastInteraction).toLocaleString() })}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}