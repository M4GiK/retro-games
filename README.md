# Retro Games

Zbiór gier w klimacie retro/8-bit — M4GiK Software.

## Launcher

`index.html` w root — ekran wyboru gier w stylu Switch (półka kaset + opis
obok), w estetyce CRT/NES. Otwórz plik w przeglądarce albo serwuj katalog
(np. `python3 -m http.server`) i wejdź na `/`.

Przejście do gry: ekran zapada się do linii CRT → ekran "wkładania kasety"
z paskiem postępu → power-on → gra ładuje się w iframe (z własnym splash'em
INSERT COIN). Powrót: przycisk `◀ MENU` w rogu albo `Esc`.

### Dodanie gry do launchera

Wpis w tablicy `GAMES` w `index.html`:

```js
{
  id: 'nazwa',            // też deep-link ?game=nazwa
  title: 'Nazwa',
  logo: ['CZĘŚĆ', '2'],   // opcjonalnie — drugi człon w żółci
  tag: 'TAGLINE',
  desc: 'Opis...',
  cover: 'covers/nazwa.jpg',
  url: 'nazwa/dist/plik.html',
  meta: [['ROK','2026'], ['GATUNEK','...'], ['GRACZE','1']],
}
```

`soon: true` = szara kaseta "???", niedostępna do odpalenia.

## Gry

- [kurkarurka/](kurkarurka/) — gra zręcznościowa w estetyce NES/Pegasus
  (TypeScript + Matter.js), kompilowana do jednego offline'owego pliku HTML.
  Szczegóły w [kurkarurka/README.md](kurkarurka/README.md).
