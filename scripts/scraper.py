import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://www.hongkongpools.com/live.html',
    'X-Requested-With': 'XMLHttpRequest'
}

def fetch_live_hk_content():
    url = "https://www.hongkongpools.com/getLiveContent"
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Cari baris / elemen 1st Prize
            # Mengambil bola angka (hkball) di area 1st Prize
            first_prize_container = soup.find(text=lambda t: t and '1st Prize' in t)
            if first_prize_container:
                parent_tr = first_prize_container.find_parent('tr')
                if parent_tr:
                    balls = parent_tr.find_all('span', class_='hkball')
                    digits = "".join([b.text.strip() for b in balls])
                    
                    if len(digits) >= 4:
                        number_4d = digits[-4:]
                        today_str = datetime.now().strftime("%d %b %Y")
                        periode_str = f"HK-{datetime.now().strftime('%Y%m%d')}"
                        
                        return {
                            "id": int(datetime.now().timestamp()),
                            "tanggal": today_str,
                            "periode": periode_str,
                            "nomor": number_4d
                        }
    except Exception as e:
        print(f"Error fetching getLiveContent: {e}")
        
    return None

def sync_hk_live():
    live_data = fetch_live_hk_content()
    if live_data:
        filepath = 'public/data/hk.json'
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
        except Exception:
            data = []

        if not any(d.get('periode') == live_data['periode'] for d in data):
            data.insert(0, live_data)
            with open(filepath, 'w') as f:
                json.dump(data[:1000], f, indent=2)
            print("Berhasil memperbarui public/data/hk.json dari Live Draw!")

if __name__ == '__main__':
    sync_hk_live()
