import { getDocsArticleBySlug } from '@/lib/db/queries/docs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBranding } from '@/lib/db/queries/branding';
import { getTenant } from '@/lib/tenant/context';
import { buildBrandIdentity, renderTenantText } from '@/lib/branding/constants';

interface Props {
  params: Promise<{
    slug: string;
    locale: string;
  }>;
}

/**
 * Conversor de markdown mínimo para los artículos de ayuda.
 *
 * El código en línea se aparta ANTES que nada y vuelve al final. Sin eso, las
 * reglas de énfasis corrían primero y se comían los guiones bajos: un
 * `whatspro_command_center_inbox` se publicaba como "whatspro<em>command</em>
 * center_inbox", con el nombre roto y sin ningún error visible. Cualquier
 * artículo técnico caía en la misma trampa.
 */
function markdownToHtml(markdown: string) {
  let html = markdown;

  // 1. Apartar el código en línea.
  const codeSpans: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // 2. Escapar el HTML del autor: el resultado va por dangerouslySetInnerHTML.
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-xl font-semibold mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-2xl font-bold mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/\*([^*\n]+)\*/g, '<em class="italic">$1</em>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');

  // Lists
  html = html.replace(/^\- (.*?)$/gm, '<li class="ml-4">$1</li>');
  html = html.replace(/(<li[^>]*>.*?<\/li>)(\s*<li[^>]*>.*?<\/li>)*/gs, '<ul class="list-disc mb-4">$&</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="mb-4">');
  html = `<p class="mb-4">${html}</p>`;

  // Clean up
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');

  // 3. Devolver el código a su lugar, ya escapado y sin pasar por el énfasis.
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => {
    const code = (codeSpans[Number(index)] ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<code class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono">${code}</code>`;
  });

  return html;
}

export default async function DocArticlePage({ params }: Props) {
  const { slug, locale } = await params;

  const [rawArticle, branding, tenant] = await Promise.all([
    getDocsArticleBySlug(slug).catch((error) => {
      console.error('Failed to load docs article:', error);
      return null;
    }),
    getBranding(),
    getTenant(),
  ]);

  if (!rawArticle) {
    notFound();
  }

  const identity = buildBrandIdentity(branding, tenant?.hostname);
  const article = {
    ...rawArticle,
    title: renderTenantText(rawArticle.title, identity),
    excerpt: rawArticle.excerpt ? renderTenantText(rawArticle.excerpt, identity) : null,
    contentMd: rawArticle.contentMd ? renderTenantText(rawArticle.contentMd, identity) : null,
    category: rawArticle.category
      ? { ...rawArticle.category, name: renderTenantText(rawArticle.category.name, identity) }
      : null,
  };

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

export const dynamic = 'force-dynamic';
