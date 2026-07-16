<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$file_win = 'counter_win.txt';
$file_linux = 'counter_linux.txt';
$file_old = 'counter.txt';

// Migrasi data lama ke counter_win jika file lama ada tapi file baru belum ada
if (!file_exists($file_win) && file_exists($file_old)) {
    copy($file_old, $file_win);
}

$count_win = file_exists($file_win) ? (int)file_get_contents($file_win) : 0;
$count_linux = file_exists($file_linux) ? (int)file_get_contents($file_linux) : 0;

$action = isset($_GET['action']) ? $_GET['action'] : 'get';
$platform = isset($_GET['platform']) ? $_GET['platform'] : '';

if ($action === 'increment') {
    if ($platform === 'win') {
        $count_win++;
        file_put_contents($file_win, $count_win);
    } elseif ($platform === 'linux') {
        $count_linux++;
        file_put_contents($file_linux, $count_linux);
    }
}

echo json_encode([
    'win' => $count_win,
    'linux' => $count_linux
]);
