'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useKeystore } from '@/lib/keystore'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { Uploader } from '@/components/uploader/Uploader'
import { ShareModal } from '@/components/share/ShareModal'
import { files as filesApi, type ApiFile } from '@/lib/api'

export default function GalleryPage() {
  const { isUnlocked, handle } = useKeystore()
  const [selectedFile, setSelectedFile] = useState<ApiFile | null>(null)

  const { data, refetch } = useQuery({
    queryKey: ['files'],
    queryFn:  () => filesApi.list(),
    enabled:  isUnlocked(),
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="font-semibold text-lg">picturefied</span>
        <span className="text-zinc-400 text-sm">@{handle}</span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Uploader onUploadComplete={() => refetch()} />

        {data?.items.length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-12">
            No photos yet. Drop some above to get started.
          </p>
        )}

        {data?.items && data.items.length > 0 && (
          <PhotoGrid items={data.items} onPhotoClick={setSelectedFile} />
        )}
      </div>

      {selectedFile && (
        <ShareModal file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </main>
  )
}
