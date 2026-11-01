import { useState } from 'react';
import type { QualityItem } from '../domain/types';

const sevLabel = { error: 'خطأ', warn: 'تنبيه', info: 'معلومة' } as const;

export function QualityPanel({ items }: { items: QualityItem[] }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const shown = items.filter((i) => filter === 'all' || i.severity === filter);
  const count = (s: string) => items.filter((i) => i.severity === s).length;
  return (
    <div className="card">
      <h2>جودة البيانات <span className="note">— للاطلاع فقط، لا يُصحَّح شيء تلقائياً</span></h2>
      <div className="tabs">
        {(['all', 'error', 'warn', 'info'] as const).map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'الكل' : sevLabel[f]}<small>{f === 'all' ? items.length : count(f)}</small></button>
        ))}
      </div>
      {shown.length === 0 && <p className="note">لا توجد عناصر.</p>}
      {shown.map((i) => (
        <div key={i.id} className={`qitem ${i.severity}`}>
          <b>{i.title}</b><span>{i.detail}</span>
          {i.where && <div className="note">{i.where}</div>}
        </div>
      ))}
    </div>
  );
}
