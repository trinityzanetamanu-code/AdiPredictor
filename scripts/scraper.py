import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

def update_data_file(filepath, new_item):
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
    except Exception:
        data = []

    # Cek apakah periode/tanggal sudah ada agar tidak duplikat
    if not any(d.get('periode') == new_item['periode'] for d in data):
        data.insert(0, new_item)
        # Batasi penyimpanan hingga 1000 data historis terakhir
        data = data[:1000]
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Berhasil memperbarui {filepath}")

# Contoh pemrosesan scraping result harian
def fetch_latest_results():
    today_str = datetime.now().strftime("%d %b %Y")
    
    # Kustomisasi logika scraping sesuai endpoint target
    # Data dummy simulasi auto-scraper
    hk_latest = {"id": int(datetime.now().timestamp()), "tanggal": today_str, "periode": f"HK-{int(datetime.now().timestamp()) % 10000}", "nomor": "8842"}
    sgp_latest = {"id": int(datetime.now().timestamp()), "tanggal": today_str, "periode": f"SGP-{int(datetime.now().timestamp()) % 10000}", "nomor": "3104"}
    sdy_latest = {"id": int(datetime.now().timestamp()), "tanggal": today_str, "periode": f"SDY-{int(datetime.now().timestamp()) % 10000}", "nomor": "5921"}

    update_data_file('public/data/hk.json', hk_latest)
    update_data_file('public/data/sgp.json', sgp_latest)
    update_data_file('public/data/sdy.json', sdy_latest)

if __name__ == '__main__':
    fetch_latest_results()
