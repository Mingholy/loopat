import { useEffect, useId, useState } from "react";
import { CodeIcon, ImageIcon } from "lucide-react";

// Lazy-load mermaid (~2MB) only when a mermaid block is actually rendered.
let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidLoading: Promise<typeof import("mermaid").default> | null = null;

function getMermaid(): Promise<typeof import("mermaid").default> {
  if (mermaidInstance) return Promise.resolve(mermaidInstance);
  if (!mermaidLoading) {
    mermaidLoading = import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "default" });
      mermaidInstance = m.default;
      return mermaidInstance;
    });
  }
  return mermaidLoading;
}

const mermaidLanguageComponents = {
  SyntaxHighlighter: ({ code }: { code: string }) => <MermaidBlock code={code} />,
  CodeHeader: () => null,
};

/** Shared componentsByLanguage config — import this instead of duplicating the wiring. */
export const componentsByLanguage = {
  mermaid: mermaidLanguageComponents,
};

export function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/:/g, "_");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    getMermaid()
      .then((m) => m.render(`mermaid${id}`, code))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-300 bg-red-50 p-3">
        <p className="mb-1 text-xs font-medium text-red-600">
          Mermaid render error
        </p>
        <pre className="overflow-x-auto text-xs text-gray-700 whitespace-pre-wrap">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5">
        <span className="text-xs font-medium text-gray-500">mermaid</span>
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          {showSource ? (
            <>
              <ImageIcon className="h-3 w-3" />
              <span>Preview</span>
            </>
          ) : (
            <>
              <CodeIcon className="h-3 w-3" />
              <span>Source</span>
            </>
          )}
        </button>
      </div>
      {showSource ? (
        <pre className="overflow-x-auto bg-gray-900 p-3 text-xs leading-relaxed text-gray-200 rounded-b-lg">
          <code>{code}</code>
        </pre>
      ) : (
        <div
          className="flex justify-center overflow-x-auto p-3 [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg ?? "" }}
        />
      )}
    </div>
  );
}
