<?php
// Arka planda çalışacak PHP sayaç mantığı (Sayfa yüklenmeden önce çalışır)
$ip_dosyasi = 'ziyaretci_ipleri.txt';
$sayac_dosyasi = 'sayac.txt';

// Ziyaretçinin IP adresini alıyoruz
$ziyaretci_ip = $_SERVER['REMOTE_ADDR'];

// Daha önce kaydedilmiş IP'leri okuyoruz
$kayitli_ipler = file_exists($ip_dosyasi) ? file($ip_dosyasi, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];

// Eğer bu IP listemizde yoksa (yeni, benzersiz bir ziyaretçi ise)
if (!in_array($ziyaretci_ip, $kayitli_ipler)) {
    // Yeni IP'yi listeye ekliyoruz
    file_put_contents($ip_dosyasi, $ziyaretci_ip . PHP_EOL, FILE_APPEND);
    
    // Sayacı okuyup 1 artırıyoruz
    $sayac = file_exists($sayac_dosyasi) ? (int)file_get_contents($sayac_dosyasi) : 0;
    $sayac++;
    file_put_contents($sayac_dosyasi, $sayac);
} else {
    // Ziyaretçi daha önce gelmişse sadece mevcut sayacı okuyoruz, artırma yapmıyoruz
    $sayac = file_exists($sayac_dosyasi) ? (int)file_get_contents($sayac_dosyasi) : 0;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ScorePop</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
            color: #333;
            text-align: center;
        }
        .container {
            padding: 40px;
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        p {
            color: #7f8c8d;
            font-size: 1.2em;
        }
        /* Sayacın şık görünmesi için eklenen basit stil */
