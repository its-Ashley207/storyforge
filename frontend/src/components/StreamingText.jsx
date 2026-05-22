import { useEffect, useRef } from 'react'

/**
 * StreamingText
 * Props:
 *   text       {string}  — current text content (grows as stream arrives)
 *   isStreaming {boolean} — show blinking cursor while true
 */
export default function StreamingText({ text = '', isStreaming = false }) {
  const containerRef = useRef(null)

  // Auto-scroll to bottom as text arrives
  useEffect(() => {
    if (!isStreaming || !containerRef.current) return
    const el = containerRef.current
    // Find scrollable ancestor
    let parent = el.parentElement
    while (parent && parent !== document.body) {
      if (parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop = parent.scrollHeight
        break
      }
      parent = parent.parentElement
    }
  }, [text, isStreaming])

  if (!text && !isStreaming) return null

  return (
    <div ref={containerRef} className="stream-text">
      {text}
      {isStreaming && <span className="stream-cursor" aria-hidden="true" />}
    </div>
  )
}
