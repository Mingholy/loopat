import { useState, type RefObject } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  /** Wrapper that contains the rendered message DOM. Used to build the rich-text (text/html) clipboard payload. */
  contentRef: RefObject<HTMLElement | null>;
  /** Raw markdown source — used for text/plain. */
  getMarkdown: () => string;
  /** Hidden until the message is hovered. Pass true to keep it visible. */
  alwaysVisible?: boolean;
  className?: string;
}

function buildHtml(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-copy-ignore]").forEach((n) => n.remove());
  return clone.innerHTML;
}

async function writeClipboard(markdown: string, html: string) {
  if (
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard &&
    "write" in navigator.clipboard
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([markdown], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // fall through to plain-text fallback
    }
  }
  await navigator.clipboard.writeText(markdown);
}

export default function MessageCopyButton({
  contentRef,
  getMarkdown,
  alwaysVisible,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    if (copied) return;
    const markdown = getMarkdown();
    const html = contentRef.current ? buildHtml(contentRef.current) : markdown;
    if (!markdown && !html) return;
    try {
      await writeClipboard(markdown, html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            data-copy-ignore=""
            aria-label={copied ? "Copied" : "Copy message"}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 select-none",
              !alwaysVisible &&
                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              className,
            )}
          >
            {copied ? (
              <CheckIcon className="h-3 w-3 text-emerald-500" />
            ) : (
              <CopyIcon className="h-3 w-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {copied ? "Copied" : "Copy message"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
