<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$file_win = 'counter_win.txt';
$file_appimage = 'counter_appimage.txt';
$file_deb = 'counter_deb.txt';

$file_old = 'counter.txt';
$file_old_linux = 'counter_linux.txt';

// Migrasi data lama ke counter_win jika file lama ada tapi file baru belum ada
if (!file_exists($file_win) && file_exists($file_old)) {
    copy($file_old, $file_win);
}

// Migrasi data linux lama ke counter_appimage jika ada
if (!file_exists($file_appimage) && file_exists($file_old_linux)) {
    copy($file_old_linux, $file_appimage);
}

$count_win = file_exists($file_win) ? (int)file_get_contents($file_win) : 0;
$count_appimage = file_exists($file_appimage) ? (int)file_get_contents($file_appimage) : 0;
$count_deb = file_exists($file_deb) ? (int)file_get_contents($file_deb) : 0;

$action = isset($_GET['action']) ? $_GET['action'] : 'get';
$platform = isset($_GET['platform']) ? $_GET['platform'] : '';

if ($action === 'increment') {
    if ($platform === 'win') {
        $count_win++;
        file_put_contents($file_win, $count_win);
    } elseif ($platform === 'appimage') {
        $count_appimage++;
        file_put_contents($file_appimage, $count_appimage);
    } elseif ($platform === 'deb') {
        $count_deb++;
        file_put_contents($file_deb, $count_deb);
    }
}

echo json_encode([
    'win' => $count_win,
    'appimage' => $count_appimage,
    'deb' => $count_deb
]);
