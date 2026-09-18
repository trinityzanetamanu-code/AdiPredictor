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
} from 'lucide-react';
import {
  loadCollectorStatus,
  loadMarketData,
  loadPrediction,
} from './dataClient';

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
  const [predictions, setPredictions] = useState({
    HK: null,
    SGP: null,
    SDY: null,
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
      const [hk, sgp, sdy, status, hkPred, sgpPred, sdyPred] =
        await Promise.all([
          loadMarketData('HK'),
          loadMarketData('SGP'),
          loadMarketData('SDY'),
          loadCollectorStatus(),
          loadPrediction('HK'),
          loadPrediction('SGP'),
          loadPrediction('SDY'),
        ]);

      setMarketData({ HK: hk, SGP: sgp, SDY: sdy });
      setCollectorStatus(status);
      setPredictions({ HK: hkPred, SGP: sgpPred, SDY: sdyPred });
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

function AutoStatusCard({ status, count, lastRefresh, dataError }) {
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
          <span className="text-slate-400">Sinkron terakhir</span>
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

function PredictionCard({ prediction, marketCode }) {
  const { copyToClipboard } = useApp();

  const quick = prediction?.quick_view || prediction?.quickView || null;
  const fourD =
    quick?.four_d?.main ||
    quick?.fourD?.main ||
    prediction?.four_d_main ||
    prediction?.prediction_4d ||
    null;

  return (
    <div className="lg:col-span-2 bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <span className="text-xs text-emerald-400 font-mono uppercase">
          {marketLabel(marketCode)}
        </span>
        <h3 className="text-lg font-bold text-slate-100">
          Rekomendasi Prediksi Otomatis
        </h3>
      </div>

      {prediction ? (
        <div className="space-y-5">
          <div className="text-xs text-slate-400">
            Target: {prediction.target_date || prediction.target || '-'} · dibuat{' '}
            {formatSyncTime(prediction.generated_at)}
          </div>

          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              4D Main
            </div>
            <div className="font-mono text-4xl font-black text-emerald-400 bg-slate-950/60 border border-slate-800 px-6 py-4 rounded-2xl">
              {fourD || '----'}
            </div>
            {fourD && (
              <button
                onClick={() => copyToClipboard(fourD)}
                className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2"
              >
                <Copy className="w-4 h-4 text-emerald-400" />
                Salin {fourD}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-slate-300">
            Prediction file terdeteksi. Quick View lengkap P1–P8 akan diaktifkan pada tahap prediction engine.
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
              Generator random lama sudah dinonaktifkan. Aplikasi hanya akan
              menampilkan prediksi yang dibuat otomatis dari dataset terbaru.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneratorPanel() {
  const {
    marketCode,
    setMarketCode,
    marketData,
    collectorStatus,
    predictions,
    lastRefresh,
    dataError,
  } = useApp();

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
          />
        </div>

        <PredictionCard
          prediction={predictions[marketCode]}
          marketCode={marketCode}
        />
      </div>
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
  const { copyToClipboard } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = MOCK_DREAMS.filter((item) =>
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
        {filtered.length} dari {MOCK_DREAMS.length} tafsir
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
    { id: 'analytics', label: 'Statistik', icon: BarChart3 },
    { id: 'dreams', label: 'Tafsir', icon: BookOpen },
  ];

  return (
    <nav className="md:hidden sticky bottom-0 z-40 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 px-2 py-2 flex justify-around">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              'flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] ' +
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
        {activeTab === 'analytics' && <AnalyticsPanel />}
        {activeTab === 'dreams' && <DreamBookPanel />}
      </main>
      <MobileNavigation />
      <Footer />
      <ToastNotification />
    </div>
  );
}
