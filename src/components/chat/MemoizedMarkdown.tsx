import { Streamdown } from 'streamdown';

/**
 * 自定义 Markdown 元素样式 — Brutalist Minimalism 风格
 * 使用项目 CSS 变量：--font-display (Space Mono), --muted, --border 等
 */
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <code className={className ? `block bg-muted rounded-lg p-3 text-sm font-mono overflow-x-auto my-1 ${className}` : 'bg-muted px-1.5 py-0.5 rounded text-sm font-mono'}>
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-1 overflow-x-auto">{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-normal">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-accent-foreground"
    >
      {children}
    </a>
  ),
  // 聊天场景中标题降级为加粗段落，避免视觉突兀
  h1: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold text-base mb-0.5">{children}</p>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold text-base mb-0.5">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold mb-0.5">{children}</p>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-border pl-3 my-1 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-2 border-border" />
  ),
};

/**
 * Streaming Markdown 渲染组件
 *
 * 使用 Vercel 官方 Streamdown 库（Vercel AI Chatbot 模板同款）：
 * - 内置 memoization，自动增量渲染
 * - 自动处理 streaming 中不完整的 Markdown 语法
 * - components prop 自定义样式
 */
export function StreamdownMarkdown({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <Streamdown
      components={markdownComponents}
      isAnimating={isStreaming}
    >
      {content}
    </Streamdown>
  );
}
