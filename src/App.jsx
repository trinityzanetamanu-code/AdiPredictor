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
  {
    kataKunci: 'Kucing',
    angka: '42 - 08 - 93',
    deskripsi: 'Simbol intuisi dan ketenangan dalam tradisi numerologi.',
  },
  {
    kataKunci: 'Terbang / Burung',
    angka: '19 - 77 - 54',
    deskripsi: 'Melambangkan kebebasan dan visi tinggi.',
  },
  {
    kataKunci: 'Air / Laut',
    angka: '03 - 26 - 88',
    deskripsi: 'Melambangkan kelimpahan energi dan kejernihan pikiran.',
  },
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
  const { copyToClipboard, marketData } = useApp();
  const [selectedMarket, setSelectedMarket] = useState('HK');
  const listData = marketData[selectedMarket] || [];

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Data Keluaran</h3>
          <p className="text-xs text-slate-400">
            Arsip remote diperbarui otomatis oleh collector GitHub.
          </p>
        </div>

        <div className="sm:w-64">
          <MarketSelect value={selectedMarket} onChange={setSelectedMarket} />
        </div>
      </div>

      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Tanggal</th>
              <th className="py-3 px-4">Periode</th>
              <th className="py-3 px-4">Angka Result</th>
              <th className="py-3 px-4">Validasi</th>
              <th className="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {listData.map((row, index) => (
              <tr key={(row.result_date || row.tanggal) + '-' + row.nomor + '-' + index}>
                <td className="py-3.5 px-4 text-slate-400">{row.tanggal}</td>
                <td className="py-3.5 px-4 text-slate-400 font-mono">
                  {row.periode}
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-mono text-emerald-400 font-bold bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-800">
                    {row.nomor}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-slate-400">
                  {verificationLabel(row.verification)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => copyToClipboard(row.nomor)}
                    className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    item.kataKunci.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl">
      <h3 className="text-lg font-bold text-slate-100 border-b border-slate-800 pb-4">
        Tafsir Kata Kunci
      </h3>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Cari kata kunci..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item, index) => (
          <div
            key={index}
            className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex justify-between items-center"
          >
            <div>
              <span className="font-bold text-sm text-slate-200">
                {item.kataKunci}
              </span>
              <p className="text-xs text-slate-400 mt-1">{item.deskripsi}</p>
            </div>
            <button
              onClick={() => copyToClipboard(item.angka)}
              className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-bold shrink-0 ml-2"
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
