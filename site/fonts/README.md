# Self-hosted typefaces

These fonts are served locally; the application makes no font-service requests.

- **IBM Plex Sans Variable**, official IBM repository commit `71f558992315a12ca1f06a2215d57962a1992162`. Latin1, Latin2, Latin3 and Pi WOFF2 subsets are copied **without modifying their contents**. Unicode ranges in `styles.css` match the upstream split stylesheet. This preserves the reserved font name and supports Latin diacritics, Vietnamese, currency, punctuation and common mathematical symbols. [Official source](https://github.com/IBM/plex/tree/71f558992315a12ca1f06a2215d57962a1992162/packages/plex-sans-variable/fonts/split/woff2). Licence: [IBM-Plex-LICENSE.txt](IBM-Plex-LICENSE.txt).
- **Literata Variable**, regular and italic with optical sizing, official project commit `0c2761b727a1b3a7cffd313c37f0f5163dfc7a63`. The upstream WOFF2 files are subset with fontTools 4.62.1 to Latin (including extended Latin and Vietnamese), combining marks, Greek, Cyrillic, punctuation, arrows and mathematical symbols. The regular face retains weight 400–600 and optical size 14–48; the reading italic is instanced at weight 400, optical size 18, to avoid downloading unused axes. The project licence declares no reserved font names. [Official source](https://github.com/googlefonts/literata/tree/0c2761b727a1b3a7cffd313c37f0f5163dfc7a63/fonts/webfonts). Licence: [Literata-OFL.txt](Literata-OFL.txt).

Fonts use `font-display: swap`. System sans-serif and Georgia/serif provide dependable fallbacks for loading and unsupported scripts. No font-building tool is a runtime or npm dependency.

## Reproduction

Download the files at the pinned source links. Copy IBM's WOFF2 subsets unmodified. Use fontTools 4.62.1 with Brotli 1.2.1 and the following command for each original Literata WOFF2, keeping all layout features and name metadata:

```bash
pyftsubset original.woff2 --output-file=literata-regular.woff2 --flavor=woff2 --unicodes='U+0000-024F,U+0300-052F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-22FF,U+25A0-25FF,U+FB00-FB06' --layout-features='*' --name-IDs='*' --name-legacy --name-languages='*'
```

Use `literata-italic.woff2` for the italic output. After subsetting, reopen each file and use `fontTools.varLib.instancer.instantiateVariableFont`: regular limits `{"wght": (400, 600), "opsz": (14, 48)}`, italic limits `{"wght": 400, "opsz": 18}`. Save as WOFF2. Original download SHA-256 values: regular `5e50643479bee69e0204164602f830502b0db42bbc29da83edc9980df17e34df`; italic `ddfb5600779fccc34c8fc6ff32a1b60a04355e9ae00a230539d852de7e0eb4ee`.

| Local file | Bytes | SHA-256 |
| --- | ---: | --- |
| `ibm-plex-sans-latin1.woff2` | 68,988 | `a18d94ea83c93f0a465d0976d8bc8ecbb031225dbaf76fd201d4e724a972034f` |
| `ibm-plex-sans-latin2.woff2` | 44,752 | `53de8a1640c42f45de9483f816dfc71dad3e87c24fbd115f4c312b8eddf39545` |
| `ibm-plex-sans-latin3.woff2` | 18,576 | `f08bc033a4959fb5fbc75a678fe56d2cd72ab5664bb3e6e1a41ac8f0d881c551` |
| `ibm-plex-sans-pi.woff2` | 23,900 | `0273a6b0411acbccb52b7d55af2bae2c58b35d68d6795a28c2f4db7ab21accbc` |
| `literata-italic.woff2` | 74,444 | `ccc9df09b07651f5c92b96efedc62bc86d6492c9b6eafbfcbf5e64b56151c713` |
| `literata-regular.woff2` | 195,152 | `bf8fbf3bad81f016f4de583212b5d417369a1656cd0ada365c201905af26834d` |
