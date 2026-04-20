param(
  [int]$Port = 3004
)

$env:PORT = "$Port"
node src/server.js
