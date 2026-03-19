import { useState } from 'react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import UploadModal from '../Upload/UploadModal'
import type { Post } from '../../lib/types'

interface AppShellProps {
  children: React.ReactNode
  onPostUploaded?: (post: Post) => void
}

export default function AppShell({ children, onPostUploaded }: AppShellProps) {
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="app-shell">
      <Sidebar onUpload={() => setUploadOpen(true)} />
      <BottomNav onUpload={() => setUploadOpen(true)} />
      <main className="shell-main">
        {children}
      </main>
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={(post) => {
            setUploadOpen(false)
            onPostUploaded?.(post)
          }}
        />
      )}
    </div>
  )
}
