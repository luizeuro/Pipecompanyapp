// Mostra texto em Markdown (relatórios e análises). O HTML gerado passa pelo
// DOMPurify: conteúdo escrito por agente nunca consegue injetar script ou
// iframe na página. Links abrem em outra aba.
import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export default function Markdown({ text, className = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(String(text || ''), { breaks: true, gfm: true })), [text])
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
