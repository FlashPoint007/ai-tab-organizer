import { memo } from 'react';

import { faviconUrl } from '@/lib/messaging/client';
import type { Translator } from '@/i18n';
import type { TabMeta } from '@/lib/types';
import { CloseIcon, PinIcon, VolumeOffIcon, VolumeOnIcon } from './icons';

interface TabRowProps {
  tab: TabMeta;
  checked: boolean;
  t: Translator;
  onToggleChecked: (tabId: number) => void;
  onActivate: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onTogglePin: (tab: TabMeta) => void;
  onToggleMute: (tab: TabMeta) => void;
}

function TabRowImpl({
  tab,
  checked,
  t,
  onToggleChecked,
  onActivate,
  onClose,
  onTogglePin,
  onToggleMute,
}: TabRowProps) {
  const actionBtn =
    'shrink-0 rounded p-1 text-neutral-500 opacity-0 transition group-hover:opacity-100 hover:bg-neutral-800 hover:text-neutral-200 focus:opacity-100';

  return (
    <div
      className={
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ' +
        (checked ? 'bg-neutral-800' : 'hover:bg-neutral-900') +
        (tab.active ? ' ring-1 ring-inset ring-emerald-900' : '')
      }
      onClick={() => onActivate(tab.id)}
    >
      <input
        type="checkbox"
        className="shrink-0 accent-emerald-600"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleChecked(tab.id)}
      />

      <img
        src={faviconUrl(tab.url)}
        alt=""
        className="h-4 w-4 shrink-0 rounded-sm"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden';
        }}
      />

      <span
        className={
          'min-w-0 flex-1 truncate ' +
          (tab.active ? 'font-medium text-neutral-100' : 'text-neutral-300')
        }
        title={`${tab.title}\n${tab.url}`}
      >
        {tab.pinned && <span className="mr-1 text-amber-400">•</span>}
        {tab.muted && <span className="mr-1">🔇</span>}
        {tab.audible && !tab.muted && <span className="mr-1">🔊</span>}
        {tab.title || tab.url}
      </span>

      <button
        type="button"
        title={tab.pinned ? t('unpin') : t('pin')}
        className={actionBtn + (tab.pinned ? ' !opacity-100 text-amber-400' : '')}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(tab);
        }}
      >
        <PinIcon className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        title={tab.muted ? t('unmuteTitle') : t('mute')}
        className={actionBtn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute(tab);
        }}
      >
        {tab.muted ? <VolumeOffIcon className="h-3.5 w-3.5" /> : <VolumeOnIcon className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        title={t('closeTab')}
        className={actionBtn + ' hover:!text-red-400'}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export const TabRow = memo(TabRowImpl);
