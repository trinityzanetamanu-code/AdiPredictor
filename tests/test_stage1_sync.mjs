import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { datasetRevision, legacyDatasetFingerprint, alignPredictionWithDataset } from '../src/datasetRevision.js';
import { clearDataMemoryCache, getDataProvenance, loadMarketBundle, loadMarketData } from '../src/dataClient.js';
import { createBoundedReconciliationRunner } from '../src/runtimeResultReconciliation.js';
import { fetchHKBoardFromSources, parseSixDigitBoard, zonedISODate, deriveHKLiveState } from '../src/liveDrawService.js';
import { predictionFreshness } from '../src/predictionFreshness.js';
import { claimEventOnce, buildRuntimeNotificationEvents } from '../src/notificationService.js';

beforeEach(() => clearDataMemoryCache());
const rows = [{ result_date:'2026-10-10', nomor:'3534' }, { result_date:'2026-10-09', nomor:'0001' }];
const response = (data, status=200) => ({ ok:status===200, status, json:async()=>data });
const prediction = { latest_result:{date:'2026-10-10',number:'3534'}, prediction_basis_date:'2026-10-10', prediction_basis_result:'3534',target_date:'2026-10-11' };

test('whole-dataset revision detects a torn publication despite matching latest date/number', async () => {
  const rev = await datasetRevision('HK',rows);
  assert.equal(rev, await datasetRevision('HK',rows.slice().reverse()));
  const matched = await alignPredictionWithDataset('HK',rows,{...prediction,dataset_revision:rev});
  assert.equal(predictionFreshness(matched,rows[0]).fresh,true);
  const torn = await alignPredictionWithDataset('HK',[rows[0],{...rows[1],nomor:'0002'}],{...prediction,dataset_revision:rev});
  assert.equal(predictionFreshness(torn,rows[0]).reason,'DATASET_VERSION_MISMATCH');
  assert.equal(predictionFreshness(await alignPredictionWithDataset('HK',rows,prediction),rows[0]).reason,'DATASET_VERSION_UNAVAILABLE');
});

test('remote failure preserves newer remote cache instead of older bundled APK', async () => {
  const original = globalThis.fetch;
  let failed = false;
  let apkReads = 0;
  globalThis.fetch = async (url) => {
    if (url.startsWith('https:')) return response(failed ? {} : rows,failed?403:200);
    apkReads += 1; return response([{result_date:'2026-09-30',nomor:'1234'}]);
  };
  try {
    assert.equal((await loadMarketData('HK'))[0].nomor,'3534');
    failed=true;
    const cached=await loadMarketData('HK');
    assert.equal(cached[0].nomor,'3534');
    assert.equal(getDataProvenance(cached).source,'REMOTE_CACHE');
    assert.equal(apkReads,0);
  } finally { globalThis.fetch=original; }
});

test('cold start restores remote cache and prevents older remote response replacing it', async () => {
  const original = globalThis.fetch;
  const oldStorage = globalThis.localStorage;
  const values=new Map();
  globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  let incoming=rows;
  globalThis.fetch=async()=>response(incoming);
  try {
    await loadMarketData('HK');
    clearDataMemoryCache();
    incoming=[{result_date:'2026-09-30',nomor:'1234'}];
    const restored=await loadMarketData('HK');
    assert.equal(restored[0].result_date,'2026-10-10');
    assert.equal(getDataProvenance(restored).source,'REMOTE_CACHE');
    incoming=[{result_date:'2026-10-10',nomor:'9999'}];
    assert.equal((await loadMarketData('HK'))[0].nomor,'3534');
  } finally {globalThis.fetch=original;globalThis.localStorage=oldStorage;}
});

test('bundle validates actual fetched pair and retains remote provenance', async () => {
  const original=globalThis.fetch;
  const rev=await datasetRevision('HK',rows);
  globalThis.fetch=async url=>response(url.includes('latest.json')?{...prediction,dataset_revision:rev}:rows);
  try {
    const bundle=await loadMarketBundle('HK');
    assert.equal(bundle.prediction.dataset_alignment,'MATCH');
    assert.equal(getDataProvenance(bundle.prediction).source,'REMOTE');
  } finally {globalThis.fetch=original;}
});

test('HK primary first, stale primary never blocks a newer mirror', async () => {
  const html=await readFile(new URL('./fixtures/hk-live-board.html',import.meta.url),'utf8');
  const calls=[];
  const value=await fetchHKBoardFromSources(async url=>{
    calls.push(url);return url.includes('rankcrack')?html.replace('September 19','September 20'):html;
  },{datasetDate:'2026-09-19'});
  assert.equal(calls[0],'https://www.hongkongpools.com/live.html');
  assert.equal(value.draw_date,'2026-09-20');
  assert.equal(value.result_status,'unknown');
});

test('403, timeout and parsing failures remain explicit; no finality from field count', async () => {
  await assert.rejects(fetchHKBoardFromSources(async()=>{throw new Error('HTTP 403');}),/HTTP 403/);
  await assert.rejects(fetchHKBoardFromSources(async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}),/timeout/);
  await assert.rejects(fetchHKBoardFromSources(async()=>'<html>No table</html>'),/DATE_NOT_FOUND/);
  const html=await readFile(new URL('./fixtures/hk-live-board.html',import.meta.url),'utf8');
  const full=parseSixDigitBoard(html,'HK');
  assert.equal(full.result_status,'unknown');
  const partial=parseSixDigitBoard(html.replace('431651',''),'HK',undefined,{allowPartial:true});
  assert.equal(partial.result_status,'partial');
  assert.notEqual(deriveHKLiveState({datasetRow:{result_date:full.draw_date,nomor:full.derived_4d},fullBoard:full}).state,'RESULT_FINAL');
});

test('Hong Kong draw date and Jayapura display date are separate at midnight', () => {
  const instant=new Date('2026-10-10T15:45:00Z');
  assert.equal(zonedISODate(instant,'Asia/Hong_Kong'),'2026-10-10');
  assert.equal(zonedISODate(instant,'Asia/Jayapura'),'2026-10-11');
});

test('one coordination coalesces poll/resume and backs off a failed cycle', async () => {
  let now=0, calls=0, release;
  const runner=createBoundedReconciliationRunner({minIntervalMs:1000,now:()=>now});
  const first=runner(async()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  await Promise.resolve();
  const resume=runner(()=>{calls++;});
  release({failed:true});
  assert.deepEqual(await resume,await first);
  assert.equal(calls,1);
  now=1001;
  assert.equal((await runner(()=>{calls++;})).skipped,true);
  now=2001;await runner(()=>{calls++;return {failed:false};});
  assert.equal(calls,2);
});

test('identical draw and metadata-only P5 revision do not repeat notifications', () => {
  const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  assert.equal(claimEventOnce('RESULT:HK:2026-10-10:3534',storage),true);
  assert.equal(claimEventOnce('RESULT:HK:2026-10-10:3534',storage),false);
  const previous={marketData:{HK:rows},predictions:{HK:{...prediction,dataset_fingerprint:'unchanged'}}};
  const current={...previous,predictions:{HK:{...prediction,dataset_fingerprint:'unchanged',metadata_revision:3}}};
  assert.deepEqual(buildRuntimeNotificationEvents({previous,current,preferences:{result:true,prediction:true}}),[]);
});

test('Analisis, cold start and resume use the same global cycle while LiveDraw has no private HK loop', async () => {
  const source=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
  const panel=source.slice(source.indexOf('function LiveDrawPanel'),source.indexOf('function AnalyticsPanel'));
  assert.match(source,/runForegroundReconciliation\('FOREGROUND_POLL'\)/);
  assert.match(source,/runForegroundReconciliation\('COLD_START'/);
  assert.match(source,/runForegroundReconciliation\('APP_RESUME'/);
  assert.match(source,/setLiveSnapshot\(snapshot\)/);
  assert.doesNotMatch(panel,/fetchNativeLiveBoard|loadLiveDrawSnapshot|refreshBoard =/);
});


test('legacy current v2 verifies its original whole-dataset fingerprint without weakening the guard', async () => {
  const legacy={...prediction,engine_version:'AdiPredictor-P1-P8-v2',dataset_fingerprint:await legacyDatasetFingerprint('HK',rows,'AdiPredictor-P1-P8-v2')};
  assert.equal((await alignPredictionWithDataset('HK',rows,legacy)).dataset_alignment,'MATCH');
  assert.equal((await alignPredictionWithDataset('HK',[rows[0],{...rows[1],nomor:'0002'}],legacy)).dataset_alignment,'DATASET_VERSION_MISMATCH');
  assert.equal((await alignPredictionWithDataset('HK',rows,{...legacy,engine_version:'unknown'})).dataset_alignment,'DATASET_VERSION_UNAVAILABLE');
});
