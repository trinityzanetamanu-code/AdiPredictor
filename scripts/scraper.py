import json
import os
from datetime import datetime
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

def scrape_hk():
    print("[*] Memulai Playwright Browser...")
    with sync_playwright() as p:
        # Menjalankan Chromium Headless dengan viewport browser desktop
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        page = context.new_page()
        
        url = "https://www.hongkongpools.com/"
        print(f"[*] Membuka URL target: {url}")
        
        try:
            # Buka halaman dan tunggu hingga JS/Cloudflare selesai me-render DOM
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            
            # Tunggu elemen hkball muncul atau tunggu 5 detik
            try:
                page.wait_for_selector(".hkball", timeout=10000)
            except Exception:
                print("[!] Elemen 'hkball' belum muncul/tidak ditemukan, mencoba parsing DOM mentah...")

            content = page.content()
            soup = BeautifulSoup(content, 'html.parser')
            balls = soup.find_all('span', class_='hkball')
            
            if balls:
                # Ambil 6 bola pertama (1st Prize)
                raw_digits = "".join([b.text.strip() for b in balls[:6]])
                number_4d = raw_digits[-4:]
                
                now = datetime.now()
                today_str = now.strftime("%d %b %Y")
                periode_str = f"HK-{now.strftime('%Y%m%d')}"
                
                print(f"[+] Ditemukan Result: {raw_digits} | 4D: {number_4d}")
                
                result_item = {
                    "id": int(now.timestamp()),
                    "tanggal": today_str,
                    "periode": periode_str,
                    "nomor": number_4d
                }
                
                # Simpan/Update ke file public/data/hk.json
                data_dir = 'public/data'
                os.makedirs(data_dir, exist_ok=True)
                filepath = os.path.join(data_dir, 'hk.json')
                
                existing_data = []
                if os.path.exists(filepath):
                    try:
                        with open(filepath, 'r') as f:
                            existing_data = json.load(f)
                    except Exception:
                        existing_data = []
                
                # Cek agar tidak terjadi duplikasi untuk periode hari ini
                if not any(d.get('periode') == periode_str for d in existing_data):
                    existing_data.insert(0, result_item)
                    with open(filepath, 'w') as f:
                        json.dump(existing_data[:1000], f, indent=2)
                    print(f"[+] Data berhasil disimpan ke {filepath}")
                else:
                    print(f"[*] Periode {periode_str} sudah tersimpan sebelumnya.")
            else:
                print("[-] Gagal mengekstrak elemen hkball dari halaman.")
                
        except Exception as e:
            print(f"[-] Error saat scraping: {e}")
        finally:
            browser.close()

if __name__ == '__main__':
    scrape_hk()
