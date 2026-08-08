import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PagePublicRead } from '@/lib/types';

interface PageViewProps {
  page: PagePublicRead;
}

export function PageView({ page }: PageViewProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">{page.title}</h1>
      <div className="prose-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-4 mt-8 text-3xl font-bold">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-3 mt-6 text-2xl font-semibold">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-2 mt-5 text-xl font-semibold">{children}</h3>,
            h4: ({ children }) => <h4 className="mb-2 mt-4 text-lg font-semibold">{children}</h4>,
            p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
            a: ({ href, children }) =>
              href && href.startsWith('/') ? (
                <Link href={href} className="text-accent-foreground hover:underline">{children}</Link>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-foreground hover:underline"
                >
                  {children}
                </a>
              ),
            img: ({ src, alt }) => (
              <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} className="my-4 max-w-full h-auto rounded-lg" />
            ),
            ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
            ol: ({ children }) => <ol className="mb-4 list-decimal pl-6">{children}</ol>,
            li: ({ children }) => <li className="mb-1">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-4 border-l-4 border-gray-300 pl-4 italic text-gray-600">
                {children}
              </blockquote>
            ),
            // react-markdown v9: `inline` prop was removed.
            // Block code (fenced ```) is wrapped in <pre><code class="language-xxx">.
            // Inline code has no className. We style <pre> for the block container
            // and <code> for inline styling; block <code> keeps its language class.
            code: ({ className, children }) => (
              <code className={className ?? 'rounded bg-gray-100 px-1.5 py-0.5 text-sm'}>
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="my-4 overflow-x-auto rounded-lg bg-gray-900 p-4 text-gray-100">
                {children}
              </pre>
            ),
            table: ({ children }) => <table className="my-4 w-full border-collapse">{children}</table>,
            thead: ({ children }) => <thead>{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            th: ({ children }) => (
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 font-semibold">{children}</th>
            ),
            td: ({ children }) => <td className="border border-gray-300 px-3 py-2">{children}</td>,
            hr: () => <hr className="my-6 border-gray-300" />,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            em: ({ children }) => <em>{children}</em>,
          }}
        >
          {page.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
