import { useState, type RefObject } from "react";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
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

/**
 * Copy text using document.execCommand as a fallback for insecure (HTTP) contexts
 * where navigator.clipboard is unavailable.
 */
function execCommandCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Prevent scrolling and keep element invisible
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

async function writeClipboard(markdown: string, html: string) {
  // Attempt 1: rich-text via ClipboardItem (secure contexts with full API)
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

  // Attempt 2: plain-text via clipboard API (secure contexts)
  if (navigator.clipboard && "writeText" in navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(markdown);
      return;
    } catch {
      // fall through to execCommand fallback
    }
  }

  // Attempt 3: execCommand fallback for insecure (HTTP) contexts
  if (!execCommandCopy(markdown)) {
    throw new Error("All clipboard methods failed");
  }
}

export default function MessageCopyButton({
  contentRef,
  getMarkdown,
  alwaysVisible,
  className,
}: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const onClick = async () => {
    if (status !== "idle") return;
    const markdown = getMarkdown();
    const html = contentRef.current ? buildHtml(contentRef.current) : markdown;
    if (!markdown && !html) return;
    try {
      await writeClipboard(markdown, html);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const label =
    status === "copied"
      ? "Copied"
      : status === "failed"
        ? "Copy failed"
        : "Copy message";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            data-copy-ignore=""
            aria-label={label}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 select-none",
              !alwaysVisible &&
                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              className,
            )}
          >
            {status === "copied" ? (
              <CheckIcon className="h-3 w-3 text-emerald-500" />
            ) : status === "failed" ? (
              <XIcon className="h-3 w-3 text-red-500" />
            ) : (
              <CopyIcon className="h-3 w-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
