import { useEffect, useState } from 'react';

import { sendRequest } from '@/lib/messaging/client';
import type { RequestPayloadMap } from '@/lib/messaging/protocol';
import type { Translator } from '@/i18n';

interface SnapshotModalProps {
  t: Translator;
  onClose: () => void;
  onRestored: (opened: number, skipped: number) => void;
  onError: (message: string) => void;
}

type SnapshotItem = RequestPayloadMap['listSnapshots'][number];

export function SnapshotModal({ t, onClose, onRestored, onError }: SnapshotModalProps) {
  const [items, setItems] = useState<SnapshotItem[] | null>(null);

  async function reload(): Promise<void> {
    try {
      setItems(await sendRequest({ type: 'listSnapshots' }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    // 仅在打开弹窗时加载一次；回调 props 每次渲染都是新引用，不进依赖
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restore(id: string): Promise<void> {
    try {
      const r = await sendRequest<{ opened: number; skipped: number }>({
        type: 'restoreSnapshot',
        id,
      });
      onRestored(r.opened, r.skipped);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await sendRequest({ type: 'deleteSnapshot', id });
      await reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-ink-700 bg-ink-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">{t('snapshotTitle')}</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-neutral-400 transition hover:bg-ink-800 hover:text-neutral-200"
            onClick={onClose}
          >
            {t('closeBtn')}
          </button>
        </div>

        {items === null && <p className="text-sm text-neutral-500">{t('loading')}</p>}
        {items !== null && items.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">{t('snapshotEmpty')}</p>
        )}

        <ul className="space-y-2">
          {(items ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/40 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{s.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {t('snapshotTabsCount', { count: s.count })} ·{' '}
                  {new Date(s.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </div>
              <button
                type="button"
                className="brand-button rounded-md px-2.5 py-1 text-xs font-semibold"
                onClick={() => void restore(s.id)}
              >
                {t('restore')}
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-ink-800 hover:text-red-300"
                onClick={() => void remove(s.id)}
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-dashed border-ink-700 py-2 text-xs text-neutral-400 transition hover:border-brass-600/50 hover:text-neutral-200"
          onClick={() => {
            void (async () => {
              try {
                await sendRequest({ type: 'createSnapshot' });
                await reload();
              } catch (e) {
                onError(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          {t('createSnapshotForWindow')}
        </button>
      </div>
    </div>
  );
}
