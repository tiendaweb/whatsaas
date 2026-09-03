import { notFound } from 'next/navigation';
import { buildEmbedBoard, getTaskEmbedContext } from '@/lib/plugins/tasks/server/embed';
import { TaskEmbedBoard } from '@/lib/plugins/tasks/ui/embed/TaskEmbedBoard';
import type { TaskProject } from '@/lib/plugins/tasks/client/types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string; locale: string }>;
};

export default async function TaskEmbedPage({ params }: PageProps) {
  const { token } = await params;

  const ctx = await getTaskEmbedContext(token);
  if (!ctx.ok) notFound();

  const board = await buildEmbedBoard(ctx);
  if (!board) notFound();

  return (
    <TaskEmbedBoard
      token={token}
      initial={{
        access: board.access,
        scope: board.scope,
        title: board.title,
        projects: board.projects as TaskProject[],
      }}
    />
  );
}
