import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BackendPost, BackendPostCategory } from '@/lib/api';
import { CategorySidebar } from '@/components/posts/CategorySidebar';
import { RecommendationSidebar } from '@/components/posts/RecommendationSidebar';

interface PostViewProps {
  post: BackendPost;
  categories: BackendPostCategory[];
  recommendations: BackendPost[];
}

export function PostView({ post, categories, recommendations }: PostViewProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <CategorySidebar categories={categories} activeSlug={post.category?.slug} />
      </div>
      <article className="w-full px-4 py-8 lg:col-span-2 lg:mx-auto lg:max-w-3xl">
        {post.category && (
          <nav className="mb-8 flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
            <Link href="/posts" className="transition hover:text-primary">
              Posts
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <Link
              href={`/posts/${post.category.slug}`}
              className="transition hover:text-primary"
            >
              {post.category.label}
            </Link>
          </nav>
        )}

        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="mb-8 w-full rounded-md"
          />
        )}

        {/* Editorial headline */}
        <h1
          className="mb-5 text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {post.title}
        </h1>

        {post.published_at && (
          <div className="mb-8 flex items-center gap-3 font-mono text-[12px] text-muted-foreground border-b border-border pb-6">
            <span>{new Date(post.published_at).toLocaleDateString()}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{Math.max(1, Math.ceil(post.content.length / 500))} MIN READ</span>
          </div>
        )}

        {post.excerpt && (
          <p
            className="mb-8 border-l-2 border-primary pl-4 text-lg italic text-muted-foreground"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {post.excerpt}
          </p>
        )}

        <div className="prose-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="mb-4 mt-10 text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{children}</h1>,
              h2: ({ children }) => (
                <h2 className="mb-3 mt-8 text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                  <span className="mono-label text-primary mr-2">/</span>
                  {children}
                </h2>
              ),
              h3: ({ children }) => <h3 className="mb-2 mt-6 text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{children}</h3>,
              h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{children}</h4>,
              p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
              a: ({ href, children }) =>
                href && href.startsWith('/') ? (
                  <Link href={href} className="text-primary hover:underline">{children}</Link>
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {children}
                  </a>
                ),
              img: ({ src, alt }) => (
                <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} className="my-4 max-w-full h-auto rounded-md" />
              ),
              ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
              ol: ({ children }) => <ol className="mb-4 list-decimal pl-6">{children}</ol>,
              li: ({ children }) => <li className="mb-1">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="my-6 border-l-2 border-primary pl-4 italic text-muted-foreground">
                  {children}
                </blockquote>
              ),
              code: ({ className, children }) => (
                <code className={className ?? 'rounded bg-secondary px-1.5 py-0.5 text-[13px] font-mono'}>
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="my-4 overflow-x-auto rounded-md bg-foreground p-4 text-[13px] text-background font-mono">
                  {children}
                </pre>
              ),
              table: ({ children }) => <table className="my-4 w-full border-collapse font-mono text-[13px]">{children}</table>,
              thead: ({ children }) => <thead>{children}</thead>,
              tbody: ({ children }) => <tbody>{children}</tbody>,
              th: ({ children }) => (
                <th className="border border-border bg-secondary px-3 py-2 text-left font-semibold">{children}</th>
              ),
              td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
              hr: () => <hr className="my-8 border-border" />,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em>{children}</em>,
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
      <div className="lg:col-span-1">
        <RecommendationSidebar posts={recommendations} />
      </div>
    </div>
  );
}
