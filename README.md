# Maxi Tray

Desktopowy generator pudełek do druku 3D.
Działa offline na Windows 11 (x64 / ARM) i macOS na Apple Silicon (M1–M5), a także w przeglądarce.

**[Otwórz w przeglądarce](https://aki76pl.github.io/maxi-tray/)** · **[Pobierz aplikację](https://github.com/aki76pl/maxi-tray/releases/latest)**

## Modele

| Model | Części do druku | Uwagi |
| --- | --- | --- |
| Przegródki | tacka | opcjonalnie sztaplowana: stopka wchodzi w tackę poniżej, podgląd stosu w 3D |
| Pudełko z zawiasem | podstawa, pokrywka | zawias na sworzeń (np. odcinek filamentu 1,75 mm), zatrzask, żebrowane ścianki |
| Pudełko (bez okuć) | podstawa, pokrywka | zawias z drukowanymi stożkowymi czopami, zatrzask |
| Pojemnik ścienny | pojemnik (+ klipsy Skådis) | IKEA Skådis (klipsy drukowane na płasko) albo gniazda na magnesy, pochylona krawędź |
| Skrzynka z rączką | skrzynka | środkowa ścianka z uchwytem, przegródki |
| Gridfinity | pojemnik albo płyta bazowa | siatka 42 mm, wysokość w jednostkach 7 mm, rant do sztaplowania, magnesy 6×2 |
| Pudełko z wsuwanym wiekiem | pudełko, wieczko | wieczko w rowkach, wsuwane od przodu |
| Pudełko składane | arkusz | druk na płasko, zawiasy z cienkiej warstwy, wieczko z klapką |
| Tacka składana | arkusz, przegrody | druk na płasko, wkładane przegrody krzyżowe |

## Co potrafi

- Wymiary, grubość ścianek, zaokrąglenia i parametry właściwe dla każdego modelu.
- Edytor przegródek (w modelach z przegródkami): klikasz komorę, żeby podzielić ją w pionie lub poziomie na 2–6 części, przeciągasz ścianki, usuwasz je, wstawiasz gotową siatkę N × M.
- Sztaplowanie: stopka, która wchodzi w pudełko poniżej, z regulowanym luzem.
- Podgląd 3D na żywo, objętość i szacowana masa filamentu.
- Eksport do **STL** (wszystkie części na jednym stole), **3MF** (każda część jako osobny obiekt) albo każdej części do osobnego pliku STL. Siatka jest szczelna (manifold), slicer nie powinien jej naprawiać.
- Zapis i odczyt projektu (`.maxi.json`), cofanie i ponawianie (Ctrl/Cmd+Z, Ctrl+Y / Cmd+Shift+Z).

## Uruchomienie ze źródeł

Wymaga Node.js 20+.

```bash
npm install
npm start
```

Wersja przeglądarkowa lokalnie: `npm run web`, potem otwórz http://localhost:5173. Każdy push do `main` publikuje ją na GitHub Pages (workflow `.github/workflows/pages.yml`).

## Budowanie instalatorów

### Windows 11

```bash
npm run dist:win
```

W `dist/` powstają instalator `Maxi Tray-1.0.0-win-x64-setup.exe` i wersja przenośna `…-portable.exe`.
Na Windows ARM użyj `npm run dist:win-arm`.

> NSIS nie obsługuje bardzo długich ścieżek. Jeśli budowanie kończy się błędem `!include: could not open file`, przenieś projekt do krótszej ścieżki, np. `C:\src\maxi-tray`.

### macOS (Apple Silicon, w tym M5)

Pakiet dla macOS trzeba zbudować na Macu:

```bash
npm install
npm run dist:mac
```

W `dist/` powstaje `Maxi Tray-1.0.0-mac-arm64.dmg` (oraz `.zip`). Aplikacja ma podpis ad-hoc, a nie certyfikat Apple Developer, dlatego przy pierwszym uruchomieniu:

- kliknij ikonę prawym przyciskiem → **Otwórz** → **Otwórz**, albo
- wykonaj w Terminalu `xattr -cr "/Applications/Maxi Tray.app"`.

### GitHub Actions (oba systemy naraz)

Workflow `.github/workflows/build.yml` buduje wersje Windows i macOS (runner `macos-latest` to Apple Silicon).
Uruchom go ręcznie (zakładka Actions → Build → Run workflow) albo wypchnij tag `v1.0.0`. Gotowe pliki pojawią się w artefaktach przebiegu.

## Struktura

| Plik | Rola |
| --- | --- |
| `main.js` | Proces główny Electron: okno, protokół `app://`, okna zapisu i odczytu plików |
| `preload.cjs` | Bezpieczny most do zapisu i odczytu plików |
| `app/geometry.js` | Wspólne narzędzia geometrii (manifold-3d), układ przegródek, eksport STL i 3MF |
| `app/models/*.js` | Definicje modeli: parametry, budowa brył, części do druku |
| `app/renderer.js` | Interfejs: suwaki, podgląd three.js, edytor przegródek, historia |
| `app/zip.js` | Minimalny zapis ZIP potrzebny do 3MF |
| `scripts/vendor.mjs` | Kopiuje potrzebne pliki three.js i manifold do `app/vendor` |
| `test/geometry.test.mjs` | `npm test`: buduje każdy model i sprawdza, czy każda część jest jedną szczelną bryłą |

## Uwagi

- Jeśli proces GPU Chromium się wysypie (zdarza się w sesjach zdalnych lub przy starych sterownikach), aplikacja raz uruchamia się ponownie z `--disable-gpu-sandbox`. Gdy WebGL dalej nie działa, edytor i eksport nadal są dostępne, a wyłączony zostaje tylko podgląd 3D.
- Modele składane i zawiasy nie są jeszcze sprawdzone na prawdziwym wydruku. Grubość zawiasu i luzy warto dopasować do swojej drukarki.
