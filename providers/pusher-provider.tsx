'use client';

import PusherClient from 'pusher-js';
import { createContext, useContext, useEffect, useState } from 'react';

const PusherContext = createContext<PusherClient | null>(null);

export function PusherProvider({
  children,
  teamId,
}: {
  children: React.ReactNode;
  teamId: number | null | undefined;
}) {
  const [pusherClient, setPusherClient] = useState<PusherClient | null>(null);

  useEffect(() => {
    if (!teamId || !process.env.NEXT_PUBLIC_PUSHER_KEY || !process.env.NEXT_PUBLIC_PUSHER_CLUSTER) return;

    const client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
    setPusherClient(client);

    return () => {
      client.disconnect();
      setPusherClient(null);
    };
  }, [teamId]);

  return (
    <PusherContext.Provider value={pusherClient}>
      {children}
    </PusherContext.Provider>
  );
}

export function usePusher() {
  return useContext(PusherContext);
}
