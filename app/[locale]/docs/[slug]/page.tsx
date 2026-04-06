import { getDocsArticleBySlug } from '@/lib/db/queries/docs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{
    slug: string;
    locale: string;
  }>;
}

// Simple markdown to HTML converter for basic markdown
function markdownToHtml(markdown: string) {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-xl font-semibold mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-2xl font-bold mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/__((.*?)(?:__)?)/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_((.*?)(?:_)?)/g, '<em class="italic">$1</em>');

  // Code inline
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono">$1</code>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');

  // Lists
  html = html.replace(/^\- (.*?)$/gm, '<li class="ml-4">$1</li>');
  html = html.replace(/(<li.*?<\/li>)/s, '<ul class="list-disc mb-4">$1</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="mb-4">');
  html = `<p class="mb-4">${html}</p>`;

  // Clean up
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

export default async function DocArticlePage({ params }: Props) {
  const { slug, locale } = await params;

  const article = await getDocsArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb and Back Button */}
        <div className="flex items-center gap-2 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/${locale}/docs`} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver a documentación
            </Link>
          </Button>
          {article.category && (
            <>
              <span className="text-muted-foreground">/</span>
              <Link
                href={`/${locale}/docs?category=${article.category.slug}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {article.category.name}
              </Link>
            </>
          )}
        </div>

        {/* Article Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
          {article.excerpt && (
            <p className="text-lg text-muted-foreground mb-4">{article.excerpt}</p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {article.updatedAt && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <time dateTime={article.updatedAt.toISOString()}>
                  Actualizado {new Date(article.updatedAt).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </div>
            )}
            {article.audience && (
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span className="capitalize">
                  {article.audience === 'technical' && 'Técnico'}
                  {article.audience === 'non_technical' && 'Para todos'}
                  {article.audience === 'mixed' && 'Mixto'}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {article.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Article Content */}
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <div
            className="bg-white dark:bg-slate-950 rounded-lg border border-border p-8 mb-8"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(article.contentMd || ''),
            }}
          />
        </article>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-border flex justify-between">
          <Button variant="outline" asChild>
            <Link href={`/${locale}/docs`}>← Documentación</Link>
          </Button>
          {article.category && (
            <Button variant="outline" asChild>
              <Link href={`/${locale}/docs?category=${article.category.slug}`}>
                Más en {article.category.name} →
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
