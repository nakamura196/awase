import { useTranslations } from 'next-intl';
import type { DcField } from '@/lib/dts/collection';

// Dublin Core の項目を、名前と値の表にして見せる。タイトルと説明は見出しに出ているので省く
export default function DtsMetadata({ fields }: { fields: DcField[] }) {
  const t = useTranslations('Dts');
  const shown = fields.filter((f) => f.name !== 'title' && f.name !== 'description');
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm" aria-label={t('metadata')}>
      {shown.map((f) => (
        <div key={f.name} className="contents">
          <dt className="font-mono text-[var(--ds-fg-muted)]">{f.name}</dt>
          <dd className="break-words">
            {f.values.map((v, i) => (
              <span key={i}>
                {i > 0 && ' / '}
                {/^https?:\/\//.test(v.value) ? (
                  <a href={v.value} className="text-[var(--ds-primary)] hover:underline" target="_blank" rel="noreferrer">
                    {v.value}
                  </a>
                ) : (
                  v.value
                )}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
