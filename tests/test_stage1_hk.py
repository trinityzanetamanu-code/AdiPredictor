"""Controlled acceptance fixtures are NOT proof of HongkongPools finality."""
import copy
import hashlib
import json
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from scripts import collector, hk_canonical, live_board_collector as live, prediction_engine as pe

FIXTURES = Path(__file__).parent / 'fixtures'


def board(first='813534', day='2026-10-10'):
    html = (FIXTURES / 'hk-live-board.html').read_text().replace('510860', first).replace('September 19, 2026', 'October 10, 2026')
    value = live.parse_six_digit_board(html, 'HK', 'HongkongPools Market Source', hk_canonical.HK_CANONICAL_URL)
    value['draw_date'] = day
    return value


def controlled_final(value):
    return {**value, 'result_status': 'final', 'finality_evidence': {
        'contract_id': 'CONTROLLED_TEST_ONLY', 'source_marker': 'SYNTHETIC_FINAL_EVENT',
        'response_sha256': hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()}}


def enable_test_contract(monkeypatch):
    monkeypatch.setattr(hk_canonical, 'HK_FINALITY_CONTRACTS', frozenset({'CONTROLLED_TEST_ONLY'}))


def test_actual_access_fixture_is_403_not_a_result():
    meta = json.loads((FIXTURES / 'hk-live-access.json').read_text())
    assert meta['http_status'] == 403
    with pytest.raises(live.LiveBoardError, match='HTTP 403'):
        live._valid_response(SimpleNamespace(status_code=403, text=(FIXTURES / 'hk-live-403-sanitized.html').read_text()), meta['requested_url'])


@pytest.mark.parametrize('first,last4', [('813534','3534'), ('003534','3534'), ('000052','0052')])
def test_six_digit_string_and_last_four(first, last4):
    value = board(first)
    assert value['first'] == first and value['derived_4d'] == last4


def test_full_fields_or_device_structure_never_prove_finality(monkeypatch):
    with pytest.raises(ValueError, match='FINALITY_UNVERIFIED'):
        hk_canonical.validate_hk_canonical(controlled_final(board()), '2026-10-10T16:00:00Z')
    enable_test_contract(monkeypatch)
    partial = {**controlled_final(board()), 'result_status': 'partial'}
    with pytest.raises(ValueError, match='FINALITY_UNVERIFIED'):
        hk_canonical.validate_hk_canonical(partial, '2026-10-10T16:00:00Z')
    assert board()['result_status'] == 'unknown'


def test_source_date_and_timezone_not_device_retrieval_date(monkeypatch):
    enable_test_contract(monkeypatch)
    # Hong Kong has entered 11 October; UTC is still 10 October.
    proof = hk_canonical.validate_hk_canonical(controlled_final(board(day='2026-10-11')), '2026-10-10T16:01:00Z')
    assert proof['result_date'] == '2026-10-11'
    assert proof['source_timezone'] == proof['market_timezone'] == 'Asia/Hong_Kong'
    assert proof['draw_id'] == 'HK:2026-10-11'
    with pytest.raises(ValueError, match='FUTURE_DRAW_DATE'):
        hk_canonical.validate_hk_canonical(controlled_final(board(day='2026-10-11')), '2026-10-10T15:59:00Z')
    with pytest.raises(ValueError, match='TIMEZONE_MISSING'):
        hk_canonical.validate_hk_canonical(controlled_final(board()), '2026-10-11T00:00:00')


def test_identity_and_source_are_checked(monkeypatch):
    enable_test_contract(monkeypatch)
    for values, error in [({'market':'SGP'}, 'IDENTITY'), ({'source_url':'https://rankcrack.com/hk.php'}, 'SOURCE'), ({'response_url':'https://evil.invalid'}, 'SOURCE'), ({'first':813534}, 'FIRST'), ({'derived_4d':'8135'}, 'DERIVED')]:
        with pytest.raises(ValueError, match=error):
            hk_canonical.validate_hk_canonical({**controlled_final(board()), **values}, '2026-10-11T00:00:00Z')


def test_accept_once_conflict_preserves_both_numbers_and_timestamp(tmp_path, monkeypatch):
    enable_test_contract(monkeypatch)
    monkeypatch.setattr(collector, 'DATA_DIR', tmp_path)
    cfg = collector.load_config()
    value = controlled_final(board('000052'))
    assert collector.accept_hk_canonical(value, cfg, '2026-10-11T01:00:00Z')['status'] == 'accepted'
    path = tmp_path / 'hk.json'
    original = path.read_text()
    assert collector.accept_hk_canonical(value, cfg, '2026-10-11T02:00:00Z')['status'] == 'identical'
    assert path.read_text() == original
    for first in ['000099', '990052']:
        result = collector.accept_hk_canonical(controlled_final(board(first)), cfg, '2026-10-11T02:00:00Z')
        assert result['status'] == 'conflict'
    assert path.read_text() == original
    conflicts = json.loads((tmp_path / 'hk-conflicts.json').read_text())
    assert len(conflicts) == 2
    assert conflicts[0]['old']['nomor'] == '0052' and conflicts[0]['new']['nomor'] == '0099'
    collector.accept_hk_canonical(controlled_final(board('000099')), cfg, '2026-10-11T03:00:00Z')
    assert len(json.loads((tmp_path / 'hk-conflicts.json').read_text())) == 2


def test_stale_board_does_not_stop_search_and_primary_is_first(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        text = (FIXTURES / 'hk-live-board.html').read_text()
        if url.endswith('hk.php'): text = text.replace('September 19', 'September 20')
        return SimpleNamespace(status_code=200, text=text, url=url)
    monkeypatch.setattr(live, '_dataset_row', lambda market: {'result_date':'2026-09-19','nomor':'0860'})
    value = live.collect_hk(SimpleNamespace(get=get))
    assert calls[0] == hk_canonical.HK_CANONICAL_URL
    assert value['draw_date'] == '2026-09-20'
    assert value['canonical_candidate']['source_url'] == hk_canonical.HK_CANONICAL_URL


@pytest.mark.parametrize('failure', ['403', 'timeout', 'parse'])
def test_access_timeout_and_parse_failures_are_not_success(failure, monkeypatch):
    def get(url, **kwargs):
        if failure == 'timeout': raise requests.Timeout('controlled timeout')
        return SimpleNamespace(status_code=403 if failure=='403' else 200, text='no result table'*20, url=url)
    with pytest.raises(live.LiveBoardError):
        live.collect_hk(SimpleNamespace(get=get))


def test_board_metadata_uses_latest_dataset_and_error_is_per_market(tmp_path, monkeypatch):
    monkeypatch.setattr(live, 'DATA_DIR', tmp_path)
    (tmp_path/'hk.json').write_text(json.dumps([{'result_date':'2026-10-10','nomor':'3534'}]))
    result = {'requested':['HK','SDY'], 'boards':{'HK':board()}, 'errors':[{'market':'SDY','error':'HTTP 403'}]}
    path=tmp_path/'live-draw.json'
    live.publish_live_boards(result, '2026-10-11T01:00:00Z', path)
    payload=json.loads(path.read_text())
    assert payload['markets']['HK']['matches_dataset'] is True
    assert payload['status']['HK']['fetch_errors'] == []
    assert payload['status']['SDY']['health'] == 'FAILED'
    result={'requested':['HK'], 'boards':{}, 'errors':[{'market':'HK','error':'HTTP 403'}]}
    live.publish_live_boards(result, '2026-10-11T02:00:00Z', path)
    payload=json.loads(path.read_text())
    assert payload['markets']['HK']['retrieved_at']=='2026-10-11T01:00:00Z'
    assert payload['status']['HK']['last_checked_at']=='2026-10-11T02:00:00Z'
    assert payload['status']['HK']['cache_status']=='cache'


def test_sgp_actual_model_gate_survives_svg_generation(tmp_path, monkeypatch):
    history=[r for r in pe.load_history('SGP') if r['result_date'] <= '2026-10-10']
    matrix, analysis=pe.model_p5(history, details=True)
    assert analysis['P5_MODE']=='hybrid' and analysis['visual_contribution_enabled'] is True
    assert analysis['visual_predictive_edge_confirmed'] is True
    gate=copy.deepcopy(analysis['model_visual_gate'])
    monkeypatch.setattr(pe, 'PRED_DIR', tmp_path)
    visuals=pe.generate_visual_patterns('SGP',history,'2026-10-11',analysis)
    assert visuals and not any(v['visual_predictive_edge_confirmed'] for v in visuals)
    assert analysis['visual_predictive_edge_confirmed'] is True and analysis['visual_vote_weight']==1.0
    assert analysis['model_visual_gate']==gate
    assert analysis['visual_pattern_evaluation']['any_svg_edge_confirmed'] is False
    assert pe.model_p5(history)[0]==matrix
    assert all((tmp_path/v['image_path'].split('/',1)[1]).exists() for v in visuals)


def test_dataset_revision_differs_on_older_row_correction_even_same_latest():
    rows=[{'result_date':'2026-10-09','nomor':'0001'},{'result_date':'2026-10-10','nomor':'3534'}]
    changed=[{**rows[0],'nomor':'0002'},rows[1]]
    assert pe.dataset_revision('HK',rows)!=pe.dataset_revision('HK',changed)
    assert pe.dataset_fingerprint('HK',rows)!=pe.dataset_fingerprint('HK',changed)


def test_metadata_regeneration_once_then_identical_dataset_skips_engine(tmp_path, monkeypatch):
    monkeypatch.setattr(pe,'DATA_DIR',tmp_path/'data')
    monkeypatch.setattr(pe,'PRED_DIR',tmp_path/'predictions')
    pe.DATA_DIR.mkdir()
    start=date(2025,1,1)
    rows=[{'result_date':(start+timedelta(days=i)).isoformat(),'nomor':f'{(i*73+41)%10000:04d}','periode':f'HK-{i+1}'} for i in range(370)]
    (pe.DATA_DIR/'hk.json').write_text(json.dumps(list(reversed(rows))))
    first=pe.run(['HK'])['HK']
    latest=pe.PRED_DIR/'hk/latest.json'
    original=latest.read_text()
    assert first['status']=='written'
    assert pe.run(['HK'])['HK']['status']=='unchanged'
    assert latest.read_text()==original
    old=json.loads(original);old.pop('metadata_revision');old.pop('dataset_revision')
    latest.write_text(json.dumps(old))
    assert pe.run(['HK'])['HK']['status']=='written'
    regenerated=json.loads(latest.read_text())
    assert regenerated['final_candidates']==old['final_candidates']
    assert regenerated['p8_ai_instinct']==old['p8_ai_instinct']
    assert pe.run(['HK'])['HK']['status']=='unchanged'


def test_snapshot_same_draw_change_retains_old_new_evidence(tmp_path, monkeypatch):
    monkeypatch.setattr(live, 'DATA_DIR', tmp_path)
    path=tmp_path/'live-draw.json'
    for first, time in [('813534','2026-10-11T01:00:00Z'), ('810099','2026-10-11T02:00:00Z')]:
        live.publish_live_boards({'requested':['HK'], 'boards':{'HK':board(first)}, 'errors':[]},time,path)
    payload=json.loads(path.read_text())
    conflict=payload['markets']['HK']['runtime_conflicts'][0]
    assert conflict['old_first']=='813534' and conflict['new_first']=='810099'
    assert payload['status']['HK']['conflicts']
