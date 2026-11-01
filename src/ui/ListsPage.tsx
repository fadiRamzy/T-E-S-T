import { useState } from 'react';
import { clone } from '../domain/model';
import type { AppModel } from '../domain/types';
import { commit, confirmDialog, toast } from './store';

type Key = 'sectors' | 'governorates';

function ListEditor({ title, k, model }: { title: string; k: Key; model: AppModel }) {
  const [draft, setDraft] = useState('');
  const list = model.lists[k];
  const field = k === 'sectors' ? 'sector' : 'gov';
  const used = (v: string) => model.months.filter((r) => r[field] === v).length;
  const rename = (i: number, v: string) => {
    const old = list[i];
    if (v === old) return;
    const n = used(old);
    commit('تعديل قائمة', (m) => {
      const x = clone(m);
      x.lists[k][i] = v;
      if (n) for (const r of x.months) if (r[field] === old) r[field] = v;
      return x;
    });
    if (n) toast(`تم تحديث ${n} صفاً يستخدم القيمة القديمة`, 'info', true);
  };
  const remove = async (i: number) => {
    const n = used(list[i]);
    if (await confirmDialog(`حذف «${list[i]}» من القائمة؟`, { danger: true, okLabel: 'حذف', detail: n ? `ما زالت مستخدمة في ${n} صف — ستبقى القيم في الشيتات لكنها لن تظهر في الاقتراحات.` : undefined }))
      commit('حذف من قائمة', (m) => { const x = clone(m); x.lists[k].splice(i, 1); return x; });
  };
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.includes(v)) return toast('القيمة موجودة بالفعل', 'err');
    commit('إضافة لقائمة', (m) => { const x = clone(m); x.lists[k].push(v); return x; });
    setDraft('');
  };
  return (
    <div className="card">
      <h2>{title} <span className="note">({list.length})</span></h2>
      {list.map((v, i) => (
        <div className="listrow" key={i}>
          <input type="text" defaultValue={v} key={v + i} onBlur={(e) => e.target.value.trim() && rename(i, e.target.value)} aria-label={`${title} ${i + 1}`} />
          <span className="note" style={{ minWidth: 60 }}>{used(v) ? `${used(v)} صف` : ''}</span>
          <button className="btn sm danger" onClick={() => remove(i)} aria-label="حذف">✕</button>
        </div>
      ))}
      <div className="listrow" style={{ marginTop: 10 }}>
        <input type="text" value={draft} placeholder="قيمة جديدة…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" onClick={add}>إضافة</button>
      </div>
    </div>
  );
}

export function ListsPage({ model }: { model: AppModel }) {
  return (
    <>
      <p className="note">تُكتب هذه القوائم في الشيت المخفي <b>Data</b> (الأعمدة J و K) وتغذّي القوائم المنسدلة في الشيتات. يحافظ التطبيق على النص حرفياً بما فيه المسافات غير المنتظمة وعلامة « .» في نهاية أسماء المحافظات.</p>
      <div className="twocol">
        <ListEditor title="القطاعات" k="sectors" model={model} />
        <ListEditor title="المحافظات" k="governorates" model={model} />
      </div>
    </>
  );
}
