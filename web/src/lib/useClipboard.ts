import { useState, useCallback } from "react"
import copyToClipboard from "copy-to-clipboard"

export function useClipboard(duration = 1500) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback((text: string) => {
    if (!text || copied) return
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), duration)
  }, [copied, duration])

  return { copied, copy }
}
