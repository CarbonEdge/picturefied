import type { Post } from '../../lib/types'
import Uploader from '../Uploader/Uploader'

interface UploadModalProps {
  onClose: () => void
  onUploaded: (post: Post) => void
}

export default function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h3>New Post</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <Uploader onUploaded={onUploaded} />
      </div>
    </div>
  )
}
