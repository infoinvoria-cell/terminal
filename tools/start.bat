@echo off
taskkill /F /IM node.exe 2>nul
cd "C:\Users\joris\Documents\Capitalife Terminal"
npm run dev
