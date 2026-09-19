import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from 'react';
import {
  Sparkles,
  BarChart3,
  BookOpen,
  Copy,
  Search,
  Zap,
  Database,
  Calendar,
  Wifi,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  Radio,
  History,
  X,
} from 'lucide-react';
import {
  loadCollectorStatus,
  loadMarketData,
  loadPrediction,
  loadPredictionHistory,
  loadOfficial4DResult,
  loadOfficialTotoResult,
  loadTafsir,
  predictionAssetUrl,
} from './dataClient';
import LiveDrawPlayer from './components/LiveDrawPlayer';
import LiveDrawResultBoard from './components/LiveDrawResultBoard';
import { LIVE_DRAW_SOURCES, SGP_COMPOSITE_SOURCE_LABEL, calculateLiveState, selectSingaporeMode } from './liveDrawConfig';

const AppContext = createContext();

const MARKET_META = {
  HK: { label: 'Pasaran HK Pool' },
  SGP: { label: 'Pasaran SGP Pool' },
  SDY: { label: 'Pasaran SDY Pool' },
};

const MOCK_DREAMS = [
  { kataKunci: 'Kucing', angka: '42 - 08 - 93', deskripsi: 'Tafsir tradisional populer untuk simbol kucing.' },
  { kataKunci: 'Burung / Terbang', angka: '19 - 77 - 54', deskripsi: 'Tafsir tradisional untuk burung atau pengalaman terbang.' },
  { kataKunci: 'Air / Laut', angka: '03 - 26 - 88', deskripsi: 'Tafsir tradisional untuk air, laut, atau ombak.' },
  { kataKunci: 'Ular', angka: '32 - 44 - 76', deskripsi: 'Tafsir tradisional populer untuk ular.' },
  { kataKunci: 'Anjing', angka: '11 - 25 - 62', deskripsi: 'Tafsir tradisional populer untuk anjing.' },
  { kataKunci: 'Ayam', angka: '05 - 34 - 71', deskripsi: 'Tafsir tradisional populer untuk ayam.' },
  { kataKunci: 'Ikan', angka: '14 - 37 - 82', deskripsi: 'Tafsir tradisional populer untuk ikan.' },
  { kataKunci: 'Buaya', angka: '18 - 48 - 91', deskripsi: 'Tafsir tradisional populer untuk buaya.' },
  { kataKunci: 'Harimau', angka: '09 - 38 - 86', deskripsi: 'Tafsir tradisional populer untuk harimau.' },
  { kataKunci: 'Gajah', angka: '16 - 43 - 79', deskripsi: 'Tafsir tradisional populer untuk gajah.' },
  { kataKunci: 'Kuda', angka: '12 - 46 - 85', deskripsi: 'Tafsir tradisional populer untuk kuda.' },
  { kataKunci: 'Monyet', angka: '23 - 57 - 90', deskripsi: 'Tafsir tradisional populer untuk monyet.' },
  { kataKunci: 'Tikus', angka: '07 - 39 - 68', deskripsi: 'Tafsir tradisional populer untuk tikus.' },
  { kataKunci: 'Katak', angka: '21 - 55 - 84', deskripsi: 'Tafsir tradisional populer untuk katak.' },
  { kataKunci: 'Kupu-kupu', angka: '24 - 58 - 92', deskripsi: 'Tafsir tradisional populer untuk kupu-kupu.' },
  { kataKunci: 'Lebah', angka: '17 - 49 - 73', deskripsi: 'Tafsir tradisional populer untuk lebah.' },
  { kataKunci: 'Semut', angka: '13 - 36 - 64', deskripsi: 'Tafsir tradisional populer untuk semut.' },
  { kataKunci: 'Rumah', angka: '04 - 28 - 67', deskripsi: 'Tafsir tradisional untuk rumah atau tempat tinggal.' },
  { kataKunci: 'Sekolah', angka: '15 - 41 - 74', deskripsi: 'Tafsir tradisional untuk sekolah atau belajar.' },
  { kataKunci: 'Pasar', angka: '20 - 53 - 80', deskripsi: 'Tafsir tradisional untuk pasar atau tempat ramai.' },
  { kataKunci: 'Jalan', angka: '06 - 31 - 69', deskripsi: 'Tafsir tradisional untuk perjalanan atau jalan.' },
  { kataKunci: 'Jembatan', angka: '27 - 52 - 87', deskripsi: 'Tafsir tradisional untuk jembatan atau penyeberangan.' },
  { kataKunci: 'Gunung', angka: '10 - 47 - 83', deskripsi: 'Tafsir tradisional untuk gunung atau dataran tinggi.' },
  { kataKunci: 'Hujan', angka: '02 - 35 - 70', deskripsi: 'Tafsir tradisional untuk hujan.' },
  { kataKunci: 'Api', angka: '29 - 61 - 95', deskripsi: 'Tafsir tradisional untuk api atau kebakaran.' },
  { kataKunci: 'Petir', angka: '22 - 56 - 89', deskripsi: 'Tafsir tradisional untuk petir atau kilat.' },
  { kataKunci: 'Matahari', angka: '01 - 40 - 78', deskripsi: 'Tafsir tradisional untuk matahari.' },
  { kataKunci: 'Bulan', angka: '30 - 59 - 94', deskripsi: 'Tafsir tradisional untuk bulan.' },
  { kataKunci: 'Bintang', angka: '33 - 63 - 97', deskripsi: 'Tafsir tradisional untuk bintang.' },
  { kataKunci: 'Uang', angka: '08 - 45 - 81', deskripsi: 'Tafsir tradisional untuk uang atau menemukan uang.' },
  { kataKunci: 'Emas', angka: '26 - 60 - 96', deskripsi: 'Tafsir tradisional untuk emas atau perhiasan.' },
  { kataKunci: 'Motor', angka: '34 - 65 - 98', deskripsi: 'Tafsir tradisional populer untuk sepeda motor.' },
  { kataKunci: 'Mobil', angka: '37 - 66 - 99', deskripsi: 'Tafsir tradisional populer untuk mobil.' },
  { kataKunci: 'Kapal', angka: '18 - 51 - 75', deskripsi: 'Tafsir tradisional untuk kapal atau perjalanan laut.' },
  { kataKunci: 'Pesawat', angka: '25 - 62 - 88', deskripsi: 'Tafsir tradisional untuk pesawat atau perjalanan udara.' },
  { kataKunci: 'Menikah', angka: '14 - 50 - 79', deskripsi: 'Tafsir tradisional untuk pernikahan.' },
  { kataKunci: 'Bayi', angka: '05 - 43 - 72', deskripsi: 'Tafsir tradisional untuk bayi atau kelahiran.' },
  { kataKunci: 'Orang tua', angka: '16 - 54 - 83', deskripsi: 'Tafsir tradisional untuk ayah, ibu, atau orang tua.' },
  { kataKunci: 'Teman', angka: '12 - 49 - 77', deskripsi: 'Tafsir tradisional untuk teman atau sahabat.' },
  { kataKunci: 'Menangis', angka: '03 - 42 - 68', deskripsi: 'Tafsir tradisional untuk menangis atau kesedihan.' },
  { kataKunci: 'Tertawa', angka: '21 - 58 - 91', deskripsi: 'Tafsir tradisional untuk tertawa atau kegembiraan.' },
  { kataKunci: 'Jatuh', angka: '07 - 36 - 74', deskripsi: 'Tafsir tradisional untuk jatuh.' },
  { kataKunci: 'Dikejar', angka: '28 - 57 - 89', deskripsi: 'Tafsir tradisional untuk dikejar.' },
  { kataKunci: 'Meninggal / Kuburan', angka: '13 - 47 - 86', deskripsi: 'Tafsir tradisional untuk kematian atau kuburan.' },
  { kataKunci: 'Pesta', angka: '24 - 55 - 93', deskripsi: 'Tafsir tradisional untuk pesta atau perayaan.' },
  { kataKunci: 'Makan', angka: '09 - 39 - 71', deskripsi: 'Tafsir tradisional untuk makan atau jamuan.' },
  { kataKunci: 'Buah', angka: '11 - 46 - 80', deskripsi: 'Tafsir tradisional untuk buah-buahan.' },
  { kataKunci: 'Pohon', angka: '06 - 33 - 69', deskripsi: 'Tafsir tradisional untuk pohon atau hutan.' },
  { kataKunci: 'Bunga', angka: '17 - 52 - 85', deskripsi: 'Tafsir tradisional untuk bunga.' },
  { kataKunci: 'Pintu', angka: '20 - 48 - 76', deskripsi: 'Tafsir tradisional untuk pintu atau gerbang.' },
];

function marketLabel(code) {
  return MARKET_META[code]?.label || code;
}

function formatSyncTime(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function verificationLabel(value) {
  if (!value) return 'Menunggu status';
  if (value === 'official_primary') return 'Sumber resmi';
  if (value === 'primary_source') return 'Sumber utama';
  if (value.startsWith('confirmed_')) return 'Cross-check terkonfirmasi';
  return value;
}

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('generator');
  const [marketCode, setMarketCode] = useState('HK');
  const [toastMessage, setToastMessage] = useState('');

  const [marketData, setMarketData] = useState({
    HK: [],
    SGP: [],
    SDY: [],
  });
  const [collectorStatus, setCollectorStatus] = useState(null);
  const [tafsirData, setTafsirData] = useState(MOCK_DREAMS);
  const [predictions, setPredictions] = useState({
    HK: null,
    SGP: null,
    SDY: null,
  });
  const [predictionHistory, setPredictionHistory] = useState({
    HK: { records: [] },
    SGP: { records: [] },
    SDY: { records: [] },
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [dataError, setDataError] = useState('');

  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 3000);
  };

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Disalin: ' + value);
    } catch {
      showToast('Gagal menyalin.');
    }
  };

  const refreshData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);

    try {
      const [
        hk,
        sgp,
        sdy,
        status,
        hkPred,
        sgpPred,
        sdyPred,
        hkHistory,
        sgpHistory,
        sdyHistory,
        remoteTafsir,
      ] =
        await Promise.all([
          loadMarketData('HK'),
          loadMarketData('SGP'),
          loadMarketData('SDY'),
          loadCollectorStatus(),
          loadPrediction('HK'),
          loadPrediction('SGP'),
          loadPrediction('SDY'),
          loadPredictionHistory('HK'),
          loadPredictionHistory('SGP'),
          loadPredictionHistory('SDY'),
          loadTafsir(),
        ]);

      setMarketData({ HK: hk, SGP: sgp, SDY: sdy });
      setCollectorStatus(status);
      setPredictions({ HK: hkPred, SGP: sgpPred, SDY: sdyPred });
      setPredictionHistory({
        HK: hkHistory,
        SGP: sgpHistory,
        SDY: sdyHistory,
      });
      if (Array.isArray(remoteTafsir) && remoteTafsir.length) {
        setTafsirData(remoteTafsir);
      }
      setLastRefresh(new Date().toISOString());
      setDataError('');
    } catch (err) {
      console.error('Gagal sinkronisasi data:', err);
      setDataError(err?.message || 'Gagal sinkronisasi data');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData(false);

    const interval = setInterval(() => refreshData(true), 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshData(true);
    };
    const onFocus = () => refreshData(true);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        marketCode,
        setMarketCode,
        marketData,
        collectorStatus,
        predictions,
        predictionHistory,
        tafsirData,
        isRefreshing,
        lastRefresh,
        dataError,
        copyToClipboard,
        toastMessage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

function ToastNotification() {
  const { toastMessage } = useApp();
  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2">
      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      <span className="text-xs font-semibold">{toastMessage}</span>
    </div>
  );
}

function Navbar() {
  const { activeTab, setActiveTab } = useApp();
  const tabs = [
    { id: 'generator', label: 'Analisis AI', icon: Sparkles },
    { id: 'results', label: 'Data Keluaran', icon: Database },
    { id: 'livedraw', label: 'LiveDraw', icon: Radio },
    { id: 'analytics', label: 'Statistik', icon: BarChart3 },
    { id: 'dreams', label: 'Tafsir', icon: BookOpen },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 shadow-lg">
            <Zap className="w-6 h-6 fill-slate-950" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-white">
            AdiPredictor <span className="text-emerald-400">AI</span>
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={
                  'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition ' +
                  (active
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200')
                }
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function MarketSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
    >
      {Object.entries(MARKET_META).map(([code, meta]) => (
        <option key={code} value={code}>
          {meta.label}
        </option>
      ))}
    </select>
  );
}

function AutoStatusCard({ status, count, lastRefresh, dataError, collectedAt, predictionAt }) {
  const latestStatus = status?.latest_verified || status?.latest;

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Wifi className="w-4 h-4 text-emerald-400" />
        <h3 className="font-semibold text-slate-200 text-sm">Analisis Otomatis</h3>
      </div>

      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Auto refresh</span>
          <span className="text-emerald-400 font-semibold">Aktif · 60 detik</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Validasi data</span>
          <span className="text-slate-200 font-semibold text-right">
            {verificationLabel(latestStatus?.verification)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Jumlah data</span>
          <span className="text-slate-200 font-mono">{count} result</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Data dikoleksi</span>
          <span className="text-slate-200 text-right">
            {formatSyncTime(collectedAt || latestStatus?.collected_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Prediksi dibuat</span>
          <span className="text-slate-200 text-right">
            {formatSyncTime(predictionAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Aplikasi mengecek</span>
          <span className="text-slate-200 text-right">
            {formatSyncTime(lastRefresh)}
          </span>
        </div>
      </div>

      <div
        className={
          'rounded-xl border px-3 py-2.5 text-[11px] ' +
          (dataError
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300')
        }
      >
        {dataError
          ? 'Sinkronisasi bermasalah: ' + dataError
          : 'Data baru masuk otomatis tanpa tombol proses. Setelah APK ini terpasang, update hasil tidak memerlukan install ulang.'}
      </div>
    </div>
  );
}

function CandidateChips({ items = [] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const value = typeof item === 'string' ? item : item?.number;
        const stars = typeof item === 'string' ? '' : item?.star_label || '';
        const support = typeof item === 'string' ? [] : item?.supported_by || item?.support || [];
        const weightedScore = typeof item === 'string' ? null : item?.reliability_weighted_score;
        if (!value) return null;
        return (
          <span
            key={value + stars}
            className="inline-flex flex-col rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <span className="inline-flex items-center gap-1 font-mono">
              <span className="text-emerald-400 font-bold">{value}</span>
              {stars && <span className="text-[10px]">{stars}</span>}
            </span>
            {support.length > 0 && (
              <span className="mt-1 text-[8px] font-sans text-slate-500">
                {support.join(' · ')} · raw {item.raw_support_count ?? support.length}
                {weightedScore != null ? ` · w ${Number(weightedScore).toFixed(2)}` : ''}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function PredictionCard({ prediction, marketCode, latest, onOpenHistory }) {
  const { copyToClipboard } = useApp();
  const candidateNumber = (value) =>
    typeof value === 'object' && value !== null ? value.number : value;

  const predictionLatest = prediction?.latest_result;
  const latestNumber = String(latest?.nomor || '').padStart(4, '0');
  const predictionFresh =
    !!prediction &&
    (!predictionLatest ||
      (predictionLatest.date === latest?.result_date &&
        String(predictionLatest.number || '').padStart(4, '0') === latestNumber));

  const quick =
    predictionFresh
      ? prediction?.quick_view || prediction?.quickView || null
      : null;

  const four = quick?.four_d || quick?.fourD || {};
  const three = quick?.three_d || quick?.threeD || {};
  const two = quick?.two_d || quick?.twoD || {};
  const bbfs = quick?.bbfs || {};
  const p8 = predictionFresh ? prediction?.p8_ai_instinct || {} : {};
  const raw = predictionFresh ? prediction?.raw_consensus || {} : {};
  const weighted = predictionFresh ? prediction?.weighted_consensus || {} : {};
  const confidence = predictionFresh ? prediction?.confidence || {} : {};
  const audit = predictionFresh ? prediction?.prior_prediction_audit : null;
  const models = predictionFresh ? prediction?.models || {} : {};
  const visuals = predictionFresh ? prediction?.visual_patterns || [] : [];
  const counts = predictionFresh
    ? prediction?.candidate_counts || quick?.candidate_counts || {}
    : {};

  const fourD =
    candidateNumber(four?.main) ||
    prediction?.four_d_main ||
    prediction?.prediction_4d ||
    null;

  const copyQuickView = () => {
    if (!quick) return;
    const text = [
      marketLabel(marketCode),
      'Target ' + (prediction?.target_period || '-') + ' · ' + (prediction?.target_date || '-'),
      'BBFS6 ' + (bbfs.main6 || '-') + ' | R ' + (bbfs.reserve6 || '-'),
      'BBFS5 ' + (bbfs.main5 || '-') + ' | R ' + (bbfs.reserve5 || '-'),
      '4D ' + [four.main, four.alternative, four.reserve, four.single_pair].map(candidateNumber).filter(Boolean).join(' / '),
      '3D Depan ' + (three.front || []).map((x) => x.number || x).join(' '),
      '3D Belakang ' + (three.back || []).map((x) => x.number || x).join(' '),
      '2D Depan ' + (two.front || []).map((x) => x.number || x).join(' '),
      '2D Tengah ' + (two.middle || []).map((x) => x.number || x).join(' '),
      '2D Belakang ' + (two.back || []).map((x) => x.number || x).join(' '),
      'Kembar ' + (two.kembar?.main || '-') + ' / ' + (two.kembar?.reserve || '-'),
      'P8 ' + (p8.four_d_main || '-') + ' / ' + (p8.four_d_reserve || '-'),
    ].join('\n');
    copyToClipboard(text);
  };
  const auditPermutationLabel = (entry, legacyExact = false) =>
    (entry?.exact ?? legacyExact) ? 'EXACT' : entry?.permutation ? 'PERMUTATION' : 'MISS';
  const auditReverseLabel = (entry, legacyExact = false) =>
    (entry?.exact ?? legacyExact) ? 'EXACT' : entry?.reverse ? 'REVERSE' : 'MISS';

  return (
    <div className="lg:col-span-2 bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <span className="text-xs text-emerald-400 font-mono uppercase">
          {marketLabel(marketCode)}
        </span>
        <h3 className="text-lg font-bold text-slate-100">
          Rekomendasi Prediksi Otomatis
        </h3>
      </div>

      {predictionFresh && quick ? (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div className="text-slate-400">
              Target:{' '}
              <span className="text-slate-100 font-semibold">
                {prediction.target_period || '-'} · {prediction.target_date || '-'}
              </span>
            </div>
            <div className="text-slate-500">
              Dibuat {formatSyncTime(prediction.generated_at)}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              4D Main
            </div>
            <div className="mt-2 font-mono text-4xl sm:text-5xl font-black text-emerald-400">
              {fourD || '----'}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {fourD && (
                <button
                  onClick={() => copyToClipboard(fourD)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2"
                >
                  <Copy className="w-4 h-4 text-emerald-400" />
                  Salin 4D
                </button>
              )}
              <button
                onClick={copyQuickView}
                className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Salin Quick View
              </button>
              <button
                onClick={onOpenHistory}
                className="px-3.5 py-2 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-semibold flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                Histori Prediksi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">BBFS 6D</div>
              <div className="font-mono text-xl font-bold text-emerald-400">{bbfs.main6 || '-'}</div>
              <div className="mt-1 text-xs text-slate-500">Cadangan: <span className="font-mono text-slate-300">{bbfs.reserve6 || '-'}</span></div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">BBFS 5D</div>
              <div className="font-mono text-xl font-bold text-emerald-400">{bbfs.main5 || '-'}</div>
              <div className="mt-1 text-xs text-slate-500">Cadangan: <span className="font-mono text-slate-300">{bbfs.reserve5 || '-'}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="text-sm font-bold text-slate-100">4D Kandidat</h4>
              <span className="text-[10px] text-slate-500">P1–P7 weighted consensus</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Main', four.main],
                ['Alternatif', four.alternative],
                ['Cadangan', four.reserve],
                ['1 Pasang', four.single_pair],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 p-3 text-center">
                  <div className="text-[9px] uppercase text-slate-500">{label}</div>
                  <div className="mt-1 font-mono font-bold text-emerald-400">{candidateNumber(value) || '-'}</div>
                  {value?.supported_by?.length > 0 && (
                    <div className="mt-1 text-[8px] text-slate-500">
                      {value.supported_by.join(' · ')} · w {Number(value.reliability_weighted_score || 0).toFixed(2)} {value.star_label || ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-100">3D Depan</h4>
              <CandidateChips items={three.front || []} />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-100">3D Belakang</h4>
              <CandidateChips items={three.back || []} />
            </div>
          </div>

          <div className="space-y-3">
            {[
              ['2D Depan', two.front || []],
              ['2D Tengah', two.middle || []],
              ['2D Belakang', two.back || []],
            ].map(([label, items]) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-100">{label}</h4>
                <CandidateChips items={items} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-amber-300/80">2D Kembar</div>
              <div className="mt-2 font-mono text-lg font-bold text-amber-300">
                {two.kembar?.main || '-'} · {two.kembar?.reserve || '-'}
              </div>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-violet-300/80">P8 AI Instinct</div>
              <div className="mt-2 font-mono text-lg font-bold text-violet-300">
                {p8.four_d_main || '-'} · {p8.four_d_reserve || '-'}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                BBFS6 {p8.bbfs6 || '-'} · repeat {p8.repeat_digit || '-'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs">
            <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Raw Consensus 4D</div>
                <CandidateChips items={(raw.candidate_rankings?.['4d_top3'] || []).slice(0, 3)} />
              </div>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Weighted Consensus 4D</div>
                <CandidateChips items={(weighted.candidate_rankings?.['4d_top3'] || []).slice(0, 3)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Raw consensus digit</span>
              <span className="font-mono text-slate-200 text-right">
                {(raw.digit_ranking || []).join(' > ') || '-'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Weighted digit core</span>
              <span className="font-mono text-emerald-300">
                {(weighted.digit_ranking || []).join(' > ') || '-'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-slate-400">Repeat signal</span>
              <span className="font-mono text-slate-200">
                Data {quick.repeat_signal?.data_digit || '-'} · P8 {quick.repeat_signal?.p8_digit || '-'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-slate-400">Confidence</span>
              <span className="font-semibold text-slate-200 capitalize">
                {confidence.relative_confidence || confidence.overall || 'low'}
              </span>
            </div>
          </div>

          {audit && (
            <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs">
              <summary className="font-semibold text-slate-200 cursor-pointer">Audit prediksi sebelumnya</summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                <div>Aktual: <span className="font-mono text-slate-100">{audit.actual || '-'}</span></div>
                <div>4D main: {auditPermutationLabel(audit.previous_4d_main, audit.four_d_exact)}</div>
                <div>4D alternatif: {auditPermutationLabel(audit.previous_4d_alternative)}</div>
                <div>4D cadangan: {auditPermutationLabel(audit.previous_4d_reserve)}</div>
                <div>4D single pair: {auditPermutationLabel(audit.previous_4d_single_pair)}</div>
                <div>3D depan: {auditPermutationLabel(audit['3d_front'], audit.three_d_front_hit)}</div>
                <div>3D belakang: {auditPermutationLabel(audit['3d_back'], audit.three_d_back_hit)}</div>
                <div>2D depan: {auditReverseLabel(audit['2d_front'])}</div>
                <div>2D tengah: {auditReverseLabel(audit['2d_middle'])}</div>
                <div>2D belakang: {auditReverseLabel(audit['2d_back'], audit.two_d_back_hit)}</div>
                {audit.bbfs6 && <div>BBFS6: {audit.bbfs6.occurrence_coverage?.captured}/4 digit occurrence</div>}
                {audit.bbfs5 && <div>BBFS5: {audit.bbfs5.occurrence_coverage?.captured}/4 digit occurrence</div>}
              </div>
            </details>
          )}

          {visuals.length > 0 && (
            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-100">Pola Visual</h4>
                <p className="mt-1 text-[10px] text-slate-500">Grid memakai draw aktual dari arsip, bukan gambar referensi.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visuals.map((pattern) => (
                  <div key={pattern.image_path} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                    <img
                      src={predictionAssetUrl(pattern.image_path, prediction.dataset_fingerprint)}
                      alt={`${pattern.pattern_name} ${marketCode}`}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                    <div className="p-3 text-[10px] text-slate-400 space-y-1">
                      <div className="font-semibold text-slate-200">{pattern.pattern_name?.replaceAll('_', ' ')}</div>
                      <div>{pattern.source_period} · {pattern.number_of_occurrences} occurrence</div>
                      <div>Hit rate {Number(pattern.historical_hit_rate || 0).toFixed(3)} · baseline {Number(pattern.baseline || 0).toFixed(2)}</div>
                      <div className={pattern.edge_confirmed ? 'text-emerald-300' : 'text-amber-300'}>
                        {pattern.edge_confirmed ? 'Predictive edge terkonfirmasi' : 'Visual pattern ditemukan — predictive edge belum terbukti'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <summary className="text-sm font-semibold text-slate-200 cursor-pointer">Perbandingan Reliability Model</summary>
            <div className="mt-3 space-y-2">
              {Object.entries(models)
                .sort((a, b) => Number(b[1]?.reliability_weight || b[1]?.weight || 0) - Number(a[1]?.reliability_weight || a[1]?.weight || 0))
                .map(([name, model]) => (
                  <div key={name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-200">{name}</span>
                    <span className="font-mono text-emerald-300">{Number(model.reliability_weight ?? model.weight ?? 0).toFixed(3)}</span>
                  </div>
                ))}
            </div>
          </details>

          <details className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <summary className="text-sm font-semibold text-slate-200 cursor-pointer">Detail P1–P7 dan Top-K</summary>
            <div className="mt-3 space-y-3">
              {Object.entries(models).map(([name, model]) => (
                <details key={name} className="rounded-lg border border-slate-800 p-3">
                  <summary className="text-xs font-semibold text-emerald-300 cursor-pointer">{name} · weight {Number(model.reliability_weight ?? model.weight ?? 0).toFixed(3)}</summary>
                  <div className="mt-2 text-[10px] text-slate-400 space-y-1 font-mono break-words">
                    <div>BBFS6 {model.bbfs6 || '-'} · BBFS5 {model.bbfs5 || '-'}</div>
                    <div>4D {(model['4d_top3'] || [model.four_d]).filter(Boolean).join(' · ')}</div>
                    <div>3D F {(model['3d_front_top5'] || [model.three_d_front]).filter(Boolean).join(' · ')}</div>
                    <div>3D B {(model['3d_back_top5'] || [model.three_d_back]).filter(Boolean).join(' · ')}</div>
                    <div>2D F {(model['2d_front_top5'] || [model.two_d_front]).filter(Boolean).join(' · ')}</div>
                    <div>2D M {(model['2d_middle_top5'] || [model.two_d_middle]).filter(Boolean).join(' · ')}</div>
                    <div>2D B {(model['2d_back_top5'] || [model.two_d_back]).filter(Boolean).join(' · ')}</div>
                    {model.walk_forward?.out_of_sample_points && <div className="pt-1 text-slate-500">OOS {model.walk_forward.out_of_sample_points} draw</div>}
                  </div>
                </details>
              ))}
            </div>
          </details>

          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-black text-emerald-300">🔥 QUICK VIEW — ANGKA KANDIDAT</h4>
              <p className="mt-1 text-[10px] text-slate-500">Sama 1:1 dengan quick_view pada JSON.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-500">BBFS:</span> <span className="font-mono">{bbfs.main6} / {bbfs.main5}</span></div>
              <div><span className="text-slate-500">4D:</span> <span className="font-mono">{[four.main, four.alternative, four.reserve, four.single_pair].map(candidateNumber).filter(Boolean).join(' · ')}</span></div>
              <div><span className="text-slate-500">3D Depan:</span> <span className="font-mono">{(three.front || []).map(candidateNumber).join(' · ')}</span></div>
              <div><span className="text-slate-500">3D Belakang:</span> <span className="font-mono">{(three.back || []).map(candidateNumber).join(' · ')}</span></div>
              <div><span className="text-slate-500">2D Depan:</span> <span className="font-mono">{(two.front || []).map(candidateNumber).join(' · ')}</span></div>
              <div><span className="text-slate-500">2D Tengah:</span> <span className="font-mono">{(two.middle || []).map(candidateNumber).join(' · ')}</span></div>
              <div><span className="text-slate-500">2D Belakang:</span> <span className="font-mono">{(two.back || []).map(candidateNumber).join(' · ')}</span></div>
              <div><span className="text-slate-500">Kembar:</span> <span className="font-mono">{two.kembar?.main} · {two.kembar?.reserve}</span></div>
              <div><span className="text-slate-500">P8:</span> <span className="font-mono text-violet-300">{p8.four_d_main} · {p8.four_d_reserve}</span></div>
              <div><span className="text-slate-500">Model comparison:</span> {Object.keys(models).length} model</div>
              <div><span className="text-slate-500">Candidate counts:</span> 4D {counts.total_4d_candidates ?? 6} · 3D {counts.total_3d_candidates ?? 12} · 2D {counts.total_2d_candidates ?? 20} · total {counts.total_direct_number_candidates ?? 38}</div>
            </div>
          </section>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-[10px] text-slate-500 leading-relaxed">
            {prediction.disclaimer || confidence.disclaimer || 'Prediksi dibuat otomatis dari histori dan model P1–P8. Nilai confidence adalah ukuran relatif, bukan jaminan hasil.'}
          </div>
        </div>
      ) : prediction && !predictionFresh ? (
        <div className="py-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center">
            <Clock3 className="w-7 h-7 text-amber-300" />
          </div>
          <div>
            <h4 className="font-bold text-slate-100">Prediksi sedang disinkronkan</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-md">
              Hasil terbaru sudah berubah. Aplikasi menunggu file prediksi P1–P8 yang sesuai dengan result terbaru agar prediksi lama tidak ditampilkan.
            </p>
          </div>
        </div>
      ) : (
        <div className="py-10 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h4 className="font-bold text-slate-100">
              Menunggu Prediction Engine P1–P8
            </h4>
            <p className="text-xs text-slate-400 mt-2 max-w-md">
              Generator random lama sudah dinonaktifkan. Prediksi akan muncul otomatis setelah engine selesai memproses dataset terbaru.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function historyNumber(value) {
  return typeof value === 'object' && value !== null ? value.number : value;
}

function PredictionHistoryPanel({ marketCode, setMarketCode, history, onClose }) {
  const records = history?.records || [];

  return (
    <section className="bg-slate-900/95 rounded-2xl border border-violet-500/25 p-5 sm:p-6 shadow-xl space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-violet-300">
            <History className="w-5 h-5" />
            <h3 className="text-lg font-bold">Histori Prediksi</h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Membaca arsip prediksi asli; kandidat lama tidak dihitung ulang di aplikasi.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup histori prediksi"
          className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="sm:max-w-xs">
        <MarketSelect value={marketCode} onChange={setMarketCode} />
      </div>

      <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
        {records.map((record) => {
          const four = record.four_d || {};
          const three = record.three_d || {};
          const two = record.two_d || {};
          const actual = record.actual_result;
          const audit = record.outcome_audit;
          const summary = record.hit_miss_summary;
          const anyDirectHit = summary && (
            Object.values(summary['4d'] || {}).some(Boolean) ||
            summary['3d']?.front_exact || summary['3d']?.back_exact ||
            Object.values(summary['2d'] || {}).some((item) => item?.exact)
          );
          return (
            <details
              key={`${record.target_date}-${record.dataset_fingerprint || record.generated_at}`}
              className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {record.target_date || '-'} · {record.target_period || '-'}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      basis {record.basis_latest_date || '-'} · {record.basis_latest_result || '----'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold text-emerald-400">
                      {actual?.number || 'MENUNGGU'}
                    </div>
                    <div className={
                      'text-[9px] font-semibold ' +
                      (!actual ? 'text-amber-300' : anyDirectHit ? 'text-emerald-300' : 'text-slate-500')
                    }>
                      {!actual ? 'RESULT BELUM ADA' : anyDirectHit ? 'DIRECT HIT' : 'TIDAK ADA EXACT HIT'}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-4 text-xs border-t border-slate-800 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                  <div>Dibuat: <span className="text-slate-200">{formatSyncTime(record.generated_at)}</span></div>
                  <div>Engine: <span className="text-slate-200">{record.engine_version || '-'}</span></div>
                  <div>BBFS6: <span className="font-mono text-emerald-300">{record.bbfs6 || '-'}</span></div>
                  <div>BBFS5: <span className="font-mono text-emerald-300">{record.bbfs5 || '-'}</span></div>
                </div>

                <div className="rounded-lg border border-slate-800 p-3 space-y-2">
                  <div className="text-[10px] uppercase text-slate-500">Quick View Arsip</div>
                  <div>4D <span className="font-mono text-slate-100">{[four.main, four.alternative, four.reserve, four.single_pair].map(historyNumber).filter(Boolean).join(' · ') || '-'}</span></div>
                  <div>3D depan <span className="font-mono text-slate-100">{(three.front || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>3D belakang <span className="font-mono text-slate-100">{(three.back || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D depan <span className="font-mono text-slate-100">{(two.front || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D tengah <span className="font-mono text-slate-100">{(two.middle || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>2D belakang <span className="font-mono text-slate-100">{(two.back || []).map(historyNumber).join(' · ') || '-'}</span></div>
                  <div>Kembar <span className="font-mono text-slate-100">{two.kembar?.main || '-'} · {two.kembar?.reserve || '-'}</span></div>
                </div>

                {actual && audit && (
                  <div className="rounded-lg border border-slate-800 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                    <div>4D main: <span className="text-slate-200">{audit.previous_4d_main?.exact ? 'EXACT' : audit.previous_4d_main?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    <div>4D alternatif: <span className="text-slate-200">{audit.previous_4d_alternative?.exact ? 'EXACT' : audit.previous_4d_alternative?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    <div>4D cadangan: <span className="text-slate-200">{audit.previous_4d_reserve?.exact ? 'EXACT' : audit.previous_4d_reserve?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    <div>4D single pair: <span className="text-slate-200">{audit.previous_4d_single_pair?.exact ? 'EXACT' : audit.previous_4d_single_pair?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    <div>3D depan: <span className="text-slate-200">{audit['3d_front']?.exact ? 'EXACT' : audit['3d_front']?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    <div>3D belakang: <span className="text-slate-200">{audit['3d_back']?.exact ? 'EXACT' : audit['3d_back']?.permutation ? 'PERMUTATION' : 'MISS'}</span></div>
                    {['front', 'middle', 'back'].map((slot) => (
                      <div key={slot}>2D {slot}: <span className="text-slate-200">{audit[`2d_${slot}`]?.exact ? 'EXACT' : audit[`2d_${slot}`]?.reverse ? 'REVERSE' : 'MISS'}</span></div>
                    ))}
                    <div>BBFS6: <span className="text-slate-200">{audit.bbfs6?.full_draw_coverage ? 'FULL' : `${audit.bbfs6?.occurrence_coverage?.captured ?? 0}/4`}</span></div>
                  </div>
                )}
              </div>
            </details>
          );
        })}

        {!records.length && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
            Indeks histori untuk market ini belum tersedia.
          </div>
        )}
      </div>
    </section>
  );
}

function GeneratorPanel() {
  const {
    marketCode,
    setMarketCode,
    marketData,
    collectorStatus,
    predictions,
    predictionHistory,
    lastRefresh,
    dataError,
  } = useApp();
  const [showHistory, setShowHistory] = useState(false);

  const activeData = marketData[marketCode] || [];
  const latest = activeData[0] || {
    tanggal: '-',
    nomor: '----',
    periode: '-',
  };
  const status = collectorStatus?.markets?.[marketCode] || null;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-400">
              Hasil Keluaran Terakhir ({latest.periode})
            </span>
            <h4 className="text-sm font-bold text-slate-200">
              {marketLabel(marketCode)} - {latest.tanggal}
            </h4>
          </div>
        </div>

        <span className="text-2xl font-mono font-extrabold text-emerald-400 bg-slate-950/60 px-4 py-1.5 rounded-xl border border-slate-800">
          {latest.nomor}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl">
            <label className="text-xs text-slate-400 font-medium">
              Pilih Pasaran
            </label>
            <div className="mt-2">
              <MarketSelect value={marketCode} onChange={setMarketCode} />
            </div>
          </div>

          <AutoStatusCard
            status={status}
            count={activeData.length}
            lastRefresh={lastRefresh}
            dataError={dataError}
            collectedAt={collectorStatus?.collected_at}
            predictionAt={predictions[marketCode]?.generated_at}
          />
        </div>

        <PredictionCard
          prediction={predictions[marketCode]}
          marketCode={marketCode}
          latest={latest}
          onOpenHistory={() => setShowHistory(true)}
        />
      </div>
      {showHistory && (
        <PredictionHistoryPanel
          marketCode={marketCode}
          setMarketCode={setMarketCode}
          history={predictionHistory[marketCode]}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function ResultsPanel() {
  const { marketData } = useApp();
  const [selectedMarket, setSelectedMarket] = useState('HK');
  const [selectedYear, setSelectedYear] = useState('2026');
  const sourceData = marketData[selectedMarket] || [];

  const years = Array.from(
    new Set(
      sourceData
        .map((row) => String(row.result_date || '').slice(0, 4))
        .filter(Boolean),
    ),
  ).sort((a, b) => Number(b) - Number(a));

  const listData =
    selectedYear === 'ALL'
      ? sourceData
      : sourceData.filter(
          (row) => String(row.result_date || '').slice(0, 4) === selectedYear,
        );

  useEffect(() => {
    if (years.length && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [selectedMarket, sourceData.length]);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 space-y-5 shadow-xl">
      <div className="space-y-4 border-b border-slate-800 pb-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Data Keluaran Resmi</h3>
          <p className="text-xs text-slate-400 mt-1">
            Arsip hasil disusun seperti daftar draw: periode, tanggal, dan angka result.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MarketSelect value={selectedMarket} onChange={setSelectedMarket} />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none"
          >
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
            <option value="ALL">Semua Tahun</option>
          </select>
        </div>

        <div className="text-[11px] text-slate-500">
          Menampilkan {listData.length} result · {marketLabel(selectedMarket)}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/50 max-h-[72vh] overflow-y-auto">
        {listData.map((row, index) => (
          <div
            key={(row.result_date || row.tanggal) + '-' + row.nomor + '-' + index}
            className="px-5 py-5 border-b border-slate-800/80 last:border-b-0"
          >
            <div className="flex items-start justify-between gap-5">
              <div className="font-mono font-extrabold text-base text-slate-100">
                {row.periode}
              </div>
              <div className="text-sm text-slate-300 text-right">
                {row.tanggal}
              </div>
            </div>

            <div className="mt-4">
              <span className="inline-flex font-mono text-2xl font-black text-emerald-400 tracking-wider">
                {row.nomor}
              </span>
            </div>
          </div>
        ))}

        {!listData.length && (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Data untuk pilihan ini belum tersedia.
          </div>
        )}
      </div>
    </div>
  );
}

function liveDrawState({ isRefreshing, dataError, status, latest, prediction }) {
  if (isRefreshing) return { key: 'checking', label: 'CHECKING', className: 'text-sky-300 bg-sky-500/10 border-sky-500/25' };
  if (dataError || (!latest && status?.source_errors?.length)) {
    return { key: 'source_unavailable', label: 'SOURCE UNAVAILABLE', className: 'text-rose-300 bg-rose-500/10 border-rose-500/25' };
  }
  const predictionBasis = prediction?.latest_result;
  const predictionCaughtUp = predictionBasis && latest &&
    predictionBasis.date === latest.result_date &&
    String(predictionBasis.number || '').padStart(4, '0') === String(latest.nomor || '').padStart(4, '0');
  if (Number(status?.new_count || 0) > 0 && !predictionCaughtUp) {
    return { key: 'new_result_detected', label: 'NEW RESULT DETECTED', className: 'text-amber-300 bg-amber-500/10 border-amber-500/25' };
  }
  if (latest?.verification) {
    return { key: 'verified', label: 'VERIFIED', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' };
  }
  return { key: 'waiting', label: 'WAITING', className: 'text-slate-300 bg-slate-500/10 border-slate-500/25' };
}

function LiveDrawPanel() {
  const { marketData, collectorStatus, predictions, isRefreshing, lastRefresh, dataError } = useApp();
  const [singaporeMode, setSingaporeMode] = useState(() => selectSingaporeMode());
  const [officialResults, setOfficialResults] = useState({ fourD: null, toto: null });

  useEffect(() => {
    let mounted = true;
    let timer;
    const refreshOfficial = async () => {
      try {
        const [fourD, toto] = await Promise.all([loadOfficial4DResult(), loadOfficialTotoResult()]);
        if (mounted) setOfficialResults({ fourD, toto });
      } catch (error) {
        console.warn('Official Singapore result metadata unavailable:', error);
      }
    };
    const scheduleNext = () => {
      const source = LIVE_DRAW_SOURCES[singaporeMode];
      const live = calculateLiveState(source.schedule).status === 'LIVE_WINDOW';
      timer = window.setTimeout(async () => {
        await refreshOfficial();
        if (mounted) scheduleNext();
      }, live ? 15000 : 60000);
    };
    refreshOfficial();
    scheduleNext();
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [singaporeMode]);

  const sgpSource = LIVE_DRAW_SOURCES[singaporeMode];
  const sgpOfficialResult = singaporeMode === 'SGP_4D' ? officialResults.fourD : officialResults.toto;
  const hkRow = marketData.HK?.[0] || null;
  const sgpRow = marketData.SGP?.[0] || null;
  const sdyRow = marketData.SDY?.[0] || null;
  const checkedLabel = formatSyncTime(lastRefresh);

  return (
    <div className="space-y-5">
      <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl">
        <div className="flex items-start gap-3 border-b border-slate-800 pb-4">
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-rose-300">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">LiveDraw · Broadcast & Verified Results</h3>
            <p className="mt-1 text-xs text-slate-400">
              Player resmi digunakan bila tersedia. Sumber yang tidak dapat di-embed dibuka melalui in-app browser tanpa proxy atau bypass.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-1.5">
          {[
            ['SGP_4D', 'Singapore 4D'],
            ['SGP_TOTO', 'Singapore TOTO'],
          ].map(([mode, label]) => (
            <button key={mode} onClick={() => setSingaporeMode(mode)} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition ${singaporeMode === mode ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <LiveDrawPlayer source={sgpSource} lastChecked={checkedLabel} />
      <LiveDrawResultBoard
        title={sgpSource.title + ' Result'}
        badge="Official · Singapore Pools"
        result={sgpOfficialResult}
        type={singaporeMode}
        note="Hasil official ditampilkan terpisah dari composite market dataset AdiPredictor."
      />
      <LiveDrawResultBoard
        title="SGP Composite Market Result"
        badge={SGP_COMPOSITE_SOURCE_LABEL}
        result={sgpRow}
        note="Composite 4-digit ini adalah basis dataset prediction SGP dan bukan official Singapore Pools 4D/TOTO result."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <LiveDrawPlayer source={LIVE_DRAW_SOURCES.HK} lastChecked={checkedLabel} />
          <LiveDrawResultBoard
            title="HK Market Result"
            badge="HongkongPools Market Source"
            result={hkRow}
            note={LIVE_DRAW_SOURCES.HK.note}
          />
        </div>
        <div className="space-y-3">
          <LiveDrawPlayer source={LIVE_DRAW_SOURCES.SDY} lastChecked={checkedLabel} />
          <LiveDrawResultBoard
            title="SDY Verified Result"
            badge="Market Source · Cross-checked result"
            result={sdyRow}
            note={LIVE_DRAW_SOURCES.SDY.note}
          />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="grid gap-2 text-[11px] sm:grid-cols-3">
          {['HK', 'SGP', 'SDY'].map((market) => {
            const row = marketData[market]?.[0] || null;
            const state = liveDrawState({ isRefreshing, dataError, status: collectorStatus?.markets?.[market], latest: row, prediction: predictions[market] });
            return <div key={market} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-3"><span className="font-bold text-slate-200">{market} collector</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${state.className}`}>{state.label}</span></div>;
          })}
        </div>
        <div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
          <span>Data collected: {formatSyncTime(hkRow?.collected_at || collectorStatus?.collected_at)}</span>
          <span>Prediction generated: {formatSyncTime(predictions.HK?.generated_at)}</span>
          <span>App last checked: {checkedLabel}</span>
        </div>
      </section>
    </div>
  );
}

function AnalyticsPanel() {
  const { marketData } = useApp();
  const [selectedMarket, setSelectedMarket] = useState('HK');
  const selectedData = marketData[selectedMarket] || [];

  const digitCounts = Array(10).fill(0);
  selectedData.forEach((item) => {
    String(item.nomor || '')
      .split('')
      .forEach((digit) => {
        const value = Number(digit);
        if (digit !== '' && Number.isInteger(value) && value >= 0 && value <= 9) {
          digitCounts[value] += 1;
        }
      });
  });

  const maxFreq = Math.max(...digitCounts, 1);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100">
            Matriks Frekuensi Digit (0 - 9)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Statistik sekarang dihitung per pasaran.
          </p>
        </div>
        <div className="sm:w-64">
          <MarketSelect value={selectedMarket} onChange={setSelectedMarket} />
        </div>
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {digitCounts.map((count, digit) => (
          <div
            key={digit}
            className="bg-slate-950/60 border border-slate-800 p-2 rounded-xl flex flex-col items-center justify-between h-40"
          >
            <span className="text-[11px] font-mono text-slate-400">{count}x</span>
            <div className="w-full bg-slate-900 rounded-lg h-24 flex items-end p-1">
              <div
                style={{ height: Math.round((count / maxFreq) * 100) + '%' }}
                className={
                  'w-full rounded-md ' +
                  (count === maxFreq && count > 0
                    ? 'bg-emerald-500'
                    : 'bg-slate-600')
                }
              />
            </div>
            <span className="font-bold text-sm text-slate-100 font-mono">
              {digit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DreamBookPanel() {
  const { copyToClipboard, tafsirData } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = (tafsirData || MOCK_DREAMS).filter((item) =>
    (item.kataKunci + ' ' + item.deskripsi)
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 space-y-6 shadow-xl">
      <div className="border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-slate-100">Tafsir Kata Kunci</h3>
        <p className="text-xs text-slate-400 mt-1">
          Koleksi tafsir tradisional untuk hiburan. Gunakan pencarian untuk menemukan kata kunci.
        </p>
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Cari: ular, motor, rumah, air..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none"
        />
      </div>

      <div className="text-[11px] text-slate-500">
        {filtered.length} dari {(tafsirData || MOCK_DREAMS).length} tafsir
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[68vh] overflow-y-auto pr-1">
        {filtered.map((item, index) => (
          <div
            key={index}
            className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex justify-between items-center gap-3"
          >
            <div className="min-w-0">
              <span className="font-bold text-sm text-slate-200">
                {item.kataKunci}
              </span>
              <p className="text-xs text-slate-400 mt-1">{item.deskripsi}</p>
            </div>
            <button
              onClick={() => copyToClipboard(item.angka)}
              className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-bold shrink-0"
            >
              {item.angka}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  const { isRefreshing, collectorStatus } = useApp();

  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500 mt-auto">
      <div className="flex items-center justify-center gap-2 mb-1">
        {isRefreshing ? (
          <Clock3 className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span>
          {isRefreshing
            ? 'Sinkronisasi data...'
            : collectorStatus
              ? 'Auto collector aktif'
              : 'Menggunakan data fallback'}
        </span>
      </div>
      <p>© 2026 AdiPredictor Application. All rights reserved.</p>
    </footer>
  );
}

function MobileNavigation() {
  const { activeTab, setActiveTab } = useApp();
  const tabs = [
    { id: 'generator', label: 'Analisis', icon: Sparkles },
    { id: 'results', label: 'Data', icon: Database },
    { id: 'livedraw', label: 'LiveDraw', icon: Radio },
    { id: 'analytics', label: 'Statistik', icon: BarChart3 },
    { id: 'dreams', label: 'Tafsir', icon: BookOpen },
  ];

  return (
    <nav className="md:hidden sticky bottom-0 z-40 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 px-1 py-2 flex">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              'flex-1 min-w-0 flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg text-[9px] ' +
              (active ? 'text-emerald-400 font-bold' : 'text-slate-400')
            }
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}

function MainContent() {
  const { activeTab } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'generator' && <GeneratorPanel />}
        {activeTab === 'results' && <ResultsPanel />}
        {activeTab === 'livedraw' && <LiveDrawPanel />}
        {activeTab === 'analytics' && <AnalyticsPanel />}
        {activeTab === 'dreams' && <DreamBookPanel />}
      </main>
      <MobileNavigation />
      <Footer />
      <ToastNotification />
    </div>
  );
}
