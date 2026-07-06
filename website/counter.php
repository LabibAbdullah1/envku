<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$file = 'counter.txt';

// Ambil nilai saat ini
if (file_exists($file)) {
    $count = (int)file_get_contents($file);
} else {
    $count = 0;
}

$action = isset($_GET['action']) ? $_GET['action'] : 'get';

if ($action === 'increment') {
    $count++;
    file_put_contents($file, $count);
}

echo json_encode(['count' => $count]);
