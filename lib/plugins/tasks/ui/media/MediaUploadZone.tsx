'use client';

import { Loader2, UploadCloud } from 'lucide-react';

export type MediaUploadZoneProps = {
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onPaste?: (event: React.ClipboardEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
};

export function MediaUploadZone({
  uploading,
  inputRef,
  onFile,
  onPaste,
  onDrop,
}: MediaUploadZoneProps) {
  return (
    <div onPaste={onPaste}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="flex min-h-[86px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/8 px-3 py-4 text-center text-white/50 transition hover:border-white/35 hover:bg-white/12 hover:text-white"
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
        <span className="text-xs">Arrastra, pega o selecciona media</span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = '';
          }}
        />
      </button>
    </div>
  );
}