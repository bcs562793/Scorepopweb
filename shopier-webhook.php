<?php
// Olası hataları ekrana basmasını engelleyelim (Arka planda çalışacağı için)
error_reporting(0);

// 1. Shopier'den Gelen POST Verilerini Alıyoruz
$status = $_POST['status'] ?? '';
$invoice_id = $_POST['invoice_id'] ?? ''; // Shopier'deki işlem numarası
$order_no = $_POST['order_no'] ?? '';     // Senin sitenden giden sipariş numarası
$price = $_POST['price'] ?? '';
$currency = $_POST['currency'] ?? '';
$random_nr = $_POST['random_nr'] ?? '';
$gelen_imza = $_POST['valid_signature'] ?? '';

// 2. Shopier Panelinden Aldığın API Secret (Uygulama Şifresi)
// DİKKAT: Buraya Uygulama oluşturduktan sonra verilen API Secret değerini yazmalısın!
$api_secret = "BURAYA_API_SECRET_YAZILACAK";

// 3. Güvenlik: Kendi İmzamızı (Hash) Oluşturuyoruz
$imza_metni = $random_nr . $order_no . $price . $currency;
$benim_imzam = base64_encode(hash_hmac('sha256', $imza_metni, $api_secret, true));

// 4. İmzaları Karşılaştırıyoruz
if ($benim_imzam === $gelen_imza) {
    // HARİKA! Güvenlik aşıldı, istek gerçekten Shopier'den geliyor.
    
    if ($status === 'success') {
        // ÖDEME BAŞARIYLA ÇEKİLMİŞ. 
        // Şimdi Veritabanı işlemlerini yapıyoruz.
        
        $db_host = 'localhost';
        $db_name = 'veritabani_adin'; // Kendi veritabanı adını yaz
        $db_user = 'kullanici_adin';  // Kendi veritabanı kullanıcını yaz
        $db_pass = 'sifren';          // Kendi veritabanı şifreni yaz
        
        try {
            // PDO ile veritabanına bağlan
            $db = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            // Sipariş durumunu 'onaylandı' olarak güncelle
            $stmt = $db->prepare("UPDATE siparisler SET durum = 'onaylandi', shopier_islem_no = :invoice_id WHERE siparis_no = :order_no");
            $stmt->execute([
                ':invoice_id' => $invoice_id,
                ':order_no' => $order_no
            ]);
            
            // İpucu: Bu noktada istersen kullanıcının mesajı okuma yetkisini veren ekstra bir SQL sorgusu daha çalıştırabilirsin.
            // Örn: $stmt2 = $db->prepare("UPDATE mesajlar SET erisim = 1 WHERE id = (Sipariş tablosundan gelen mesaj ID'si)");
            
        } catch (PDOException $e) {
            // Veritabanı hatası olursa istersen bir log dosyasına yazdırabilirsin
            // file_put_contents('shopier_hata.log', $e->getMessage(), FILE_APPEND);
        }
    }
    
    // İşlem bitsin veya bitmesin, Shopier'e "Veriyi aldım" demek zorundayız.
    // Eğer bunu demezsek Shopier sistemi tekrar tekrar istek atmaya çalışır.
    echo "OK";
    
} else {
    // GÜVENLİK İHLALİ: İmzalar eşleşmedi! 
    // Biri dışarıdan sitene sahte bir "ödeme yapıldı" isteği atmaya çalışıyor.
    http_response_code(400);
    echo "Gecersiz imza";
}
?>
