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
    'shrink-0 rounded-md p-1 text-neutral-500 transition hover:bg-ink-800 hover:text-neutral-200 focus:opacity-100 ' +
    'opacity-0 group-hover:opacity-100';

  return (
    <div
      className={
        'group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition ' +
        (checked ? 'bg-ink-800' : 'hover:bg-ink-850') +
        (tab.active ? ' bg-ink-850' : '')
      }
      onClick={() => onActivate(tab.id)}
    >
      {/* 活动标签：细 brass 边轨 + 柔和提亮（signature 细节） */}
      {tab.active && (
        <span className="absolute left-[2px] top-1.5 bottom-1.5 w-[3px] rounded-full bg-brass-500" />
      )}

      <input
        type="checkbox"
        className="shrink-0 accent-brass-500"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleChecked(tab.id)}
      />

      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-700/60">
        <img
          src={faviconUrl(tab.url)}
          alt=""
          className="h-4 w-4"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      </span>

      <span
        className={
          'min-w-0 flex-1 truncate ' +
          (tab.active ? 'font-medium text-neutral-50' : 'text-neutral-300')
        }
        title={`${tab.title}\n${tab.url}`}
      >
        {tab.pinned && <span className="mr-1 text-brass-400">•</span>}
        {tab.muted && <span className="mr-1">🔇</span>}
        {tab.audible && !tab.muted && <span className="mr-1">🔊</span>}
        {tab.title || tab.url}
      </span>

      <button
        type="button"
        title={tab.pinned ? t('unpin') : t('pin')}
        className={actionBtn + (tab.pinned ? ' !opacity-100 text-brass-400' : '')}
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
