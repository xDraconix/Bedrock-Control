<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$base = is_dir(__DIR__ . '/config') ? __DIR__ : dirname(__DIR__);
$path = $base . '/config/password.hash';
if (!is_dir(dirname($path))) { fwrite(STDERR, "Konfigurationsverzeichnis fehlt.\n"); exit(1); }
fwrite(STDOUT, "Neues Administrator-Passwort (mindestens 12 Zeichen): ");
$tty = function_exists('shell_exec') && trim((string)@shell_exec('command -v stty')) !== '';
if ($tty) @system('stty -echo');
try { $pw = rtrim((string)fgets(STDIN), "\r\n"); }
finally { if ($tty) @system('stty echo'); fwrite(STDOUT, "\n"); }
if (strlen($pw) < 12) { fwrite(STDERR, "Mindestens 12 Zeichen erforderlich.\n"); exit(1); }
$hash = password_hash($pw, PASSWORD_DEFAULT);
if (file_put_contents($path, $hash . "\n", LOCK_EX) === false) { fwrite(STDERR, "Passwort konnte nicht gespeichert werden.\n"); exit(1); }
@chown($path, 'root'); @chgrp($path, 'www-data'); chmod($path, 0640);
echo "Passwort gespeichert: $path\n";
