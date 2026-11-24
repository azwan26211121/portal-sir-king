import React, { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type {
  AccessLogEntry,
  CUModule,
  LearningSection,
  TopicLevel,
} from '../types.ts';

interface SearchAndTrackingViewProps {
  levels: TopicLevel[];
  cus: CUModule[];
  accessLogs: AccessLogEntry[];
  onNavigateToCu: (levelId: string, section: LearningSection, cuId: string) => void;
}

const ACTION_LABELS: Record<AccessLogEntry['action'], string> = {
  view_nota: 'Buka Nota Pembelajaran',
  view_panduan: 'Buka Panduan Soalan',
  open_form: 'Akses Latihan Google Form',
  view_sop: 'Semak SOP Bengkel',
  complete_sop: 'Lengkap Senarai Semak SOP',
};

export function SearchAndTrackingView({
  levels,
  cus,
  accessLogs,
  onNavigateToCu,
}: SearchAndTrackingViewProps) {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete' | 'ready'>('all');

  const levelMap = useMemo(() => {
    const map = new Map<string, TopicLevel>();
    for (const l of levels) map.set(l.id, l);
    return map;
  }, [levels]);

  const filteredCUs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cus.filter((cu) => {
      const teoriReady =
        Boolean(cu.teoriSub1.notaSlot) &&
        Boolean(cu.teoriSub1.panduanSoalanSlot) &&
        Boolean(cu.teoriSub2.notaSlot) &&
        Boolean(cu.teoriSub2.panduanSoalanSlot);
      const formReady =
        Boolean(cu.teoriSub1.googleFormUrl) && Boolean(cu.teoriSub2.googleFormUrl);
      const amaliReady =
        (Boolean(cu.amaliSub1.sopDocSlot) || cu.amaliSub1.sopSteps.length > 0) &&
        (Boolean(cu.amaliSub2.sopDocSlot) || cu.amaliSub2.sopSteps.length > 0);
      const allReady = teoriReady && formReady && amaliReady;

      if (filterMode === 'ready' && !allReady) return false;
      if (filterMode === 'incomplete' && allReady) return false;

      if (!q) return true;
      const lvl = levelMap.get(cu.levelId);
      const haystack = [
        lvl?.code || '',
        lvl?.title || '',
        cu.code,
        cu.title,
        cu.description,
        cu.teoriSub1.notaSlot?.originalName || '',
        cu.teoriSub1.panduanSoalanSlot?.originalName || '',
        cu.teoriSub1.googleFormTitle,
        cu.teoriSub2.notaSlot?.originalName || '',
        cu.teoriSub2.panduanSoalanSlot?.originalName || '',
        cu.teoriSub2.googleFormTitle,
        cu.amaliSub1.sopDocSlot?.originalName || '',
        cu.amaliSub2.sopDocSlot?.originalName || '',
        ...cu.amaliSub1.sopSteps.map((s) => `${s.category} ${s.title} ${s.instruction}`),
        ...cu.amaliSub2.sopSteps.map((s) => `${s.category} ${s.title} ${s.instruction}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cus, query, filterMode, levelMap]);

  const recentLogs = useMemo(() => [...accessLogs].reverse().slice(0, 25), [accessLogs]);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Carian Pantas Bahan &amp; Penjejakan Akses
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Cari tajuk CU, dokumen Word/PDF, pautan Google Form, dan langkah SOP merentas Sub 1 &amp; Sub 2 bagi Teori dan Amali.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'all', label: 'Semua CU' },
                { id: 'incomplete', label: 'Slot Kosong' },
                { id: 'ready', label: 'Lengkap' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kod CU, tajuk modul, nama fail .pdf/.docx, Google Form, atau langkah LOTO/PCD/PPE..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a2e6c]"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">Tahap &amp; CU</th>
                <th className="py-3 px-3">TEORI Sub 1</th>
                <th className="py-3 px-3">TEORI Sub 2</th>
                <th className="py-3 px-3">Google Form</th>
                <th className="py-3 px-3">AMALI (Sub 1 &amp; Sub 2)</th>
                <th className="py-3 pl-3 text-right">Akses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredCUs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    Tiada rekod CU sepadan dengan carian anda.
                  </td>
                </tr>
              ) : (
                filteredCUs.map((cu) => {
                  const lvl = levelMap.get(cu.levelId);
                  const sub1Docs =
                    (cu.teoriSub1.notaSlot ? 1 : 0) + (cu.teoriSub1.panduanSoalanSlot ? 1 : 0);
                  const sub2Docs =
                    (cu.teoriSub2.notaSlot ? 1 : 0) + (cu.teoriSub2.panduanSoalanSlot ? 1 : 0);
                  const formsCount =
                    (cu.teoriSub1.googleFormUrl ? 1 : 0) + (cu.teoriSub2.googleFormUrl ? 1 : 0);
                  const amaliDocs =
                    (cu.amaliSub1.sopDocSlot ? 1 : 0) + (cu.amaliSub2.sopDocSlot ? 1 : 0);
                  return (
                    <tr key={cu.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 pr-4">
                        <p className="text-xs font-mono text-slate-500">
                          {lvl?.code || '-'} · {cu.code}
                        </p>
                        <p className="font-medium text-slate-900">{cu.title}</p>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className={
                            sub1Docs > 0
                              ? 'text-emerald-700 hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {sub1Docs}/2 Fail
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className={
                            sub2Docs > 0
                              ? 'text-emerald-700 hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {sub2Docs}/2 Fail
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'latihan', cu.id)}
                          className={
                            formsCount > 0
                              ? 'text-[#0a2e6c] hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {formsCount}/2 Borang
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'amali_sop', cu.id)}
                          className="text-slate-700 hover:text-[#0a2e6c] hover:underline"
                        >
                          {amaliDocs}/2 Dok · {cu.amaliSub1.sopSteps.length}+{cu.amaliSub2.sopSteps.length} Langkah
                        </button>
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#0a2e6c] hover:text-[#061b44] whitespace-nowrap"
                        >
                          <span>Buka</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-900">Rekod Penjejakan Akses Terkini</h3>
        <p className="mt-1 text-xs text-slate-500">
          Memaparkan aktiviti semakan nota Word/PDF, akses Google Form, dan semakan SOP bengkel.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-4">Masa</th>
                <th className="py-2.5 px-3">Pengguna</th>
                <th className="py-2.5 px-3">Unit Kompetensi</th>
                <th className="py-2.5 pl-3">Aktiviti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    Belum ada aktiviti akses direkodkan lagi.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('ms-MY')}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {log.userName} <span className="text-slate-400">({log.userRole})</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <span className="font-mono text-[#0a2e6c]">{log.cuCode}</span> · {log.cuTitle}
                      {log.subKey && (
                        <span className="ml-1.5 font-mono text-slate-400">
                          ({log.subKey === 'sub1' ? 'Sub 1' : 'Sub 2'})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-700">{ACTION_LABELS[log.action]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
