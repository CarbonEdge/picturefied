import { useEffect, useRef } from 'react'
import type { Post } from '../../lib/types'
import Uploader from '../Uploader/Uploader'

interface UploadModalProps {
  onClose: () => void
  onUploaded: (post: Post) => void
}

export default function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
      >
        <div className="modal-header">
          <h3 id="upload-modal-title">New Post</h3>
          <button
            ref={closeButtonRef}
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </div>
        <Uploader onUploaded={onUploaded} />
      </div>
    </div>
  )
}
