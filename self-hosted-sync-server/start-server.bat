@echo off
set PORT=%1
if "%PORT%"=="" set PORT=3004
set PORT=%PORT%
node src/server.js
