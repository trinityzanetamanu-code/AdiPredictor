import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  checkNotificationPermission,
  disableNativeNotifications,
  loadNotificationPreferences,
  permissionAllowsNotifications,
  requestNotificationPermission,
  saveNotificationPreferences,
  scheduleLiveDrawReminders,
} from '../notificationService';

const categories = [
  ['result', 'Hasil Keluaran'],
  ['prediction', 'Prediksi Baru'],
  ['liveDraw', 'LiveDraw'],
  ['audit', 'Audit Prediksi'],
  ['appUpdate', 'Update Aplikasi'],
  ['collector', 'Peringatan Collector'],
];

export default function NotificationSettingsPanel() {
  const [preferences, setPreferences] = useState(() => loadNotificationPreferences());
  const [permission, setPermission] = useState('prompt');

  useEffect(() => { checkNotificationPermission().then((result) => setPermission(result.display)); }, []);

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result.display);
    if (!permissionAllowsNotifications(result)) return;
    const next = saveNotificationPreferences({ ...preferences, master: true });
    setPreferences(next);
    await scheduleLiveDrawReminders();
  };
  const toggleMaster = async () => {
    if (!preferences.master) return enable();
    const next = saveNotificationPreferences({ ...preferences, master: false });
    setPreferences(next);
    await disableNativeNotifications();
  };
  const toggleCategory = async (key) => {
    const next = saveNotificationPreferences({ ...preferences, [key]: !preferences[key] });
    setPreferences(next);
    if (key === 'liveDraw' && next.liveDraw && next.master) await scheduleLiveDrawReminders();
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl" data-notification-settings>
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{preferences.master ? <Bell className="h-4 w-4 text-emerald-400" /> : <BellOff className="h-4 w-4 text-slate-500" />}<div><h3 className="text-sm font-bold text-slate-200">Notifikasi</h3><p className="text-[10px] text-slate-500">Izin Android: {permission}</p></div></div><button type="button" onClick={toggleMaster} className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${preferences.master ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>{preferences.master ? 'ON' : 'AKTIFKAN NOTIFIKASI'}</button></div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Aplikasi meminta izin hanya setelah tombol diaktifkan. Reminder draw dijadwalkan oleh Android; notifikasi hasil/prediksi memerlukan aplikasi menerima data baru.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{categories.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300"><span>{label}</span><input type="checkbox" checked={Boolean(preferences[key])} disabled={!preferences.master} onChange={() => toggleCategory(key)} className="accent-emerald-500" /></label>)}</div>
    </section>
  );
}
