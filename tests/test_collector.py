from datetime import date

from scripts.collector import parse_weekday_grid


def make_table():
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


def test_weekday_grid_calendar_alignment():
    source = {
        "id": "fixture",
        "name": "Fixture",
        "url": "https://example.test/",
        "heading_regex": r"Data Pengeluaran Hongkong\s+{year}",
    }
    results = parse_weekday_grid(make_table(), "HK", source, 2026)

    # Week containing Jan 1 2026 starts Monday Dec 29 2025. The first
    # in-year cell therefore lands on Thursday Jan 1.
    assert results[0].result_date == date(2026, 1, 1)
    assert results[0].number == "1003"
    assert all(len(item.number) == 4 and item.number.isdigit() for item in results)
    assert len(results) >= 20


def test_source_metadata_preserved():
    source = {
        "id": "fixture",
        "name": "Fixture Source",
        "url": "https://example.test/",
        "heading_regex": r"Data Pengeluaran Hongkong\s+{year}",
    }
    item = parse_weekday_grid(make_table(), "HK", source, 2026)[0]
    assert item.market == "HK"
    assert item.source_id == "fixture"
    assert item.source_name == "Fixture Source"
