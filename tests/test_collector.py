from datetime import date

from scripts.collector import (
    parse_date_result_table,
    parse_hk_six_digit_last4,
    parse_sgp_official_4d,
    parse_weekday_grid,
    resolve_period_from_rule,
    ParsedResult,
)


def make_weekday_table():
    days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    rows = []
    n = 1000
    for _ in range(5):
        cells = []
        for _day in days:
            cells.append(f"<td>{n:04d}</td>")
            n += 1
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return f"""
    <html><body>
      <h3>Data Pengeluaran Hongkong 2026</h3>
      <table>
        <tr>{''.join(f'<th>{d}</th>' for d in days)}</tr>
        {''.join(rows)}
      </table>
    </body></html>
    """


def source(parser="weekday_grid"):
    return {
        "id": "fixture",
        "name": "Fixture Source",
        "url": "https://example.test/",
        "parser": parser,
        "heading_regex": r"Data Pengeluaran Hongkong\s+{year}",
    }


def test_weekday_grid_calendar_alignment():
    results = parse_weekday_grid(make_weekday_table(), "HK", source(), 2026)
    assert results[0].result_date == date(2026, 1, 1)
    assert results[0].number == "1003"
    assert all(len(item.number) == 4 and item.number.isdigit() for item in results)
    assert len(results) >= 20


def test_source_metadata_preserved():
    item = parse_weekday_grid(make_weekday_table(), "HK", source(), 2026)[0]
    assert item.market == "HK"
    assert item.source_id == "fixture"
    assert item.source_name == "Fixture Source"


def test_hk_six_digit_last4():
    html = """
    <table>
      <tr><td>1</td><td>Thursday</td><td>17-09-2026</td><td>7 2 9 0 5 9</td><td>1</td></tr>
      <tr><td>2</td><td>Wednesday</td><td>16-09-2026</td><td>1 9 5 0 6 5</td><td>1</td></tr>
      <tr><td>3</td><td>Tuesday</td><td>15-09-2026</td><td>4 5 0 3 7 9</td><td>1</td></tr>
      <tr><td>4</td><td>Monday</td><td>14-09-2026</td><td>0 8 4 3 3 2</td><td>1</td></tr>
      <tr><td>5</td><td>Sunday</td><td>13-09-2026</td><td>2 0 9 2 9 8</td><td>1</td></tr>
    </table>
    """
    results = parse_hk_six_digit_last4(html, "HK", source("hk_six_digit_last4"), 2026)
    assert results[-1].result_date == date(2026, 9, 17)
    assert results[-1].number == "9059"


def test_sgp_official_parser():
    html = """
    <html><body>
    Wed, 16 Sep 2026 | Draw No. 5536
    1st Prize | 9224
    2nd Prize | 1136
    Sun, 13 Sep 2026 | Draw No. 5535
    1st Prize | 9400
    Sat, 12 Sep 2026 | Draw No. 5534
    1st Prize | 2710
    </body></html>
    """
    results = parse_sgp_official_4d(html, "SGP", source("sgp_official_4d"), 2026)
    assert results[-1].number == "9224"
    assert results[-1].period == "SGP-5536"


def test_date_result_table_parser():
    html = """
    <table>
      <tr><th>Tanggal</th><th>Periode</th><th>Nomor</th></tr>
      <tr><td>17-09-2026</td><td>SY-246</td><td>5159</td></tr>
      <tr><td>16-09-2026</td><td>SY-245</td><td>4293</td></tr>
      <tr><td>15-09-2026</td><td>SY-244</td><td>8463</td></tr>
      <tr><td>14-09-2026</td><td>SY-243</td><td>9392</td></tr>
      <tr><td>13-09-2026</td><td>SY-242</td><td>6929</td></tr>
    </table>
    """
    results = parse_date_result_table(html, "SDY", source("date_result_table"), 2026)
    assert results[-1].result_date == date(2026, 9, 17)
    assert results[-1].number == "5159"


def test_date_result_table_parser_sgp_period():
    html = """
    <table>
      <tr><th>Pasaran</th><th>Tanggal</th><th>Periode</th><th>Result</th></tr>
      <tr><td>SINGAPORE</td><td>Kamis, 17 Sep 2026</td><td>SGP-2478</td><td>2131</td></tr>
      <tr><td>SINGAPORE</td><td>Rabu, 16 Sep 2026</td><td>SGP-2477</td><td>9224</td></tr>
      <tr><td>SINGAPORE</td><td>Senin, 14 Sep 2026</td><td>SGP-2476</td><td>5470</td></tr>
      <tr><td>SINGAPORE</td><td>Minggu, 13 Sep 2026</td><td>SGP-2475</td><td>9400</td></tr>
      <tr><td>SINGAPORE</td><td>Sabtu, 12 Sep 2026</td><td>SGP-2474</td><td>2710</td></tr>
    </table>
    """
    results = parse_date_result_table(html, "SGP", source("date_result_table"), 2026)
    assert results[-1].result_date == date(2026, 9, 17)
    assert results[-1].number == "2131"
    assert results[-1].period == "SGP-2478"


def test_sgp_period_rule_from_royaltoto_anchor():
    item = ParsedResult(
        market="SGP",
        result_date=date(2026, 9, 17),
        number="2131",
        source_id="fixture",
        source_name="Fixture",
        source_url="https://example.test/",
    )
    cfg = {
        "period_rule": {
            "prefix": "SGP",
            "anchor_date": "2026-09-12",
            "anchor_number": 2474,
            "valid_from": "2026-01-01",
            "weekdays": [0, 2, 3, 5, 6],
        }
    }
    resolve_period_from_rule(item, cfg)
    assert item.period == "SGP-2478"
