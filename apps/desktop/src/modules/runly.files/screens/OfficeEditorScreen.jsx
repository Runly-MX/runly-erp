import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { OfficeDocumentEditor } from '@runly/ui';
import { toast } from 'sonner';
import { runly } from '../../../lib/runly';
import { useAuth } from '../../../auth/AuthProvider';

export default function OfficeEditorScreen() {
  const { session } = useAuth();
  const authToken = useRef(session?.access_token);
  const downloadName = useRef('documento');
  useEffect(() => { authToken.current = session?.access_token; }, [session?.access_token]);
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileId = pathname.match(/\/files\/([^/]+)\/edit\/?$/)?.[1] ?? '';
  const createSession = useCallback(async (id, mode) => {
    const { data } = await runly.files.createOfficeSession(id, mode, authToken.current);
    downloadName.current = data.fileName;
    return data;
  }, []);
  // Callers may pass extra query keys to refresh (e.g. runly.lms: ['lms']).
  const extraKeys = state?.officeInvalidate;
  const saved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['files-list'] });
    if (Array.isArray(extraKeys)) for (const key of extraKeys) if (typeof key === 'string') queryClient.invalidateQueries({ queryKey: [key] });
  }, [queryClient, extraKeys]);
  const close = useCallback(() => {
    saved();
    const returnTo = state?.officeReturnTo;
    navigate(typeof returnTo === 'string' && returnTo.startsWith('/app/') && !returnTo.endsWith('/edit') ? returnTo : '/app/m/runly.files/files');
  }, [navigate, saved, state]);
  const download = useCallback(async () => {
    try {
      const result = await runly.files.downloadOfficeFile(fileId, authToken.current);
      const url = URL.createObjectURL(result);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName.current;
      link.rel = 'noreferrer';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error('No se pudo descargar. También puedes hacerlo desde el módulo de origen.'); }
  }, [fileId]);
  return <div className="fixed inset-0 z-50 h-[100dvh] w-full pb-[var(--sab)]"><OfficeDocumentEditor key={`${fileId}:${session?.user?.id}`} fileId={fileId} createSession={createSession} onClose={close} onSaved={saved} onDownload={download} /></div>;
}
