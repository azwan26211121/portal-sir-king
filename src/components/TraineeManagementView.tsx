import React, { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { ApprovalStatus, PublicUser, TopicLevel } from '../types.ts';

interface TraineeManagementViewProps {
  token: string;
  currentUser: PublicUser;
  levels: TopicLevel[];
  onUserUpdated: () => Promise<void>;
}

export function TraineeManagementView({
  token,
  currentUser,
  levels,
  onUserUpdated,
}: TraineeManagementViewProps) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [selectedLevels, setSelectedLevels] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // PIN update form (for Pengajar / Pelatih)
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.getUsers(token);
      const trainees = res.users.filter((u) => u.role === 'pelatih');
      setUsers(trainees);
      const defaults: Record<string, string> = {};
      for (const u of trainees) {
        defaults[u.id] = u.approvedLevelId || u.requestedLevelId || levels[0]?.id || '';
      }
      setSelectedLevels(defaults);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuatkan senarai pelatih.',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') return users;
    return users.filter((u) => u.status === statusFilter);
  }, [users, statusFilter]);

  async function handleDecision(userId: string, status: ApprovalStatus) {
    setActionBusyId(userId);
    setFeedback(null);
    try {
      await api.approveUser(token, userId, status, selectedLevels[userId]);
      await loadUsers();
      await onUserUpdated();
      setFeedback({
        type: 'ok',
        text:
          status === 'approved'
            ? 'Pelatih berjaya diluluskan dan akses tahap telah diaktifkan.'
            : 'Status permohonan pelatih dikemas kini.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini status pelatih.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUpdatePin(e: React.FormEvent) {
    e.preventDefault();
    setPinFeedback(null);
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      setPinFeedback({ type: 'err', text: 'PIN semasa dan PIN baharu mestilah 6 digit nombor.' });
      return;
    }
    setPinBusy(true);
    try {
      await api.updateOwnPin(token, currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setPinFeedback({ type: 'ok', text: 'PIN akses 6 digit berjaya dikemas kini.' });
    } catch (err) {
      setPinFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini PIN.',
      });
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Pengurusan &amp; Kelulusan Permohonan Pelatih
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Luluskan (<span className="font-mono text-xs">approve</span>) permohonan pelatih di bawah penyeliaan anda dan tetapkan tahap pembelajaran mereka.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'pending', label: 'Menunggu' },
                { id: 'approved', label: 'Diluluskan' },
                { id: 'rejected', label: 'Ditolak' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-lg text-xs border ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">Nama Pelatih</th>
                <th className="py-3 px-3">Guru Penyelia</th>
                <th className="py-3 px-3">Tahap Akses</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 pl-3 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Memuatkan senarai pelatih...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Tiada permohonan pelatih dalam kategori ini.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((trainee) => {
                  const busy = actionBusyId === trainee.id;
                  return (
                    <tr key={trainee.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 pr-4">
                        <p className="font-medium text-slate-900">{trainee.name}</p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          ID: {trainee.userId} · Daftar: {new Date(trainee.createdAt).toLocaleDateString('ms-MY')}
                        </p>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-700">
                        {trainee.supervisorName || 'Pentadbir Utama'}
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          aria-label={`Pilih tahap untuk ${trainee.name}`}
                          value={selectedLevels[trainee.id] || ''}
                          onChange={(e) =>
                            setSelectedLevels({
                              ...selectedLevels,
                              [trainee.id]: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {levels.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              {lvl.code} — {lvl.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-medium">
                        {trainee.status === 'approved' ? (
                          <span className="text-emerald-700">Diluluskan</span>
                        ) : trainee.status === 'rejected' ? (
                          <span className="text-red-700">Ditolak</span>
                        ) : (
                          <span className="text-amber-700">Menunggu (Pending)</span>
                        )}
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDecision(trainee.id, 'approved')}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Luluskan</span>
                          </button>
                          {trainee.status !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDecision(trainee.id, 'rejected')}
                              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-60 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Tolak</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {currentUser.role !== 'admin' && currentUser.role !== 'master_admin' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0a2e6c]" />
            <h3 className="text-base font-bold text-[#061b44]">Kemaskini PIN Akses 6 Digit</h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Tukar PIN akses 6 digit akaun pengajar anda secara berkala untuk keselamatan.
          </p>

          {pinFeedback && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs border ${
                pinFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {pinFeedback.text}
            </div>
          )}

          <form onSubmit={handleUpdatePin} className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PIN Semasa</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 digit"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums tracking-[0.2em] border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PIN Baharu</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 digit baharu"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums tracking-[0.2em] border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pinBusy}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg"
              >
                {pinBusy ? 'Menyimpan...' : 'Kemas Kini PIN 6 Digit'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
