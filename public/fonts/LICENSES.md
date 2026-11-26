# Bundled font licences

Font files in this folder are redistributed unmodified from the fontsource npm packages (latin
subset, `.woff`), renamed to `<slug>-<weight>[-italic].woff`, except where noted. The full licence
text ships inside each upstream package (`LICENSE`) and at https://openfontlicense.org.

## Added in B52 (Nov 2026)

| Family | Files | Source | Licence | Copyright |
| --- | --- | --- | --- | --- |
| Inter (500, 600) | `inter-500.woff`, `inter-600.woff` | `@fontsource/inter@4.5.15` (Inter 3.019, same version as the bundled 400 / 700) | SIL OFL 1.1 | The Inter Project Authors (https://github.com/rsms/inter) |
| Inter Tight | `inter-tight-{400,500,600,700}.woff` | `@fontsource/inter-tight@5.3.0` | SIL OFL 1.1 | 2022 The Inter Project Authors (https://github.com/rsms/inter-tight) |
| Archivo Expanded | `archivo-expanded-{400,500,600,700,800}.woff` | Archivo variable font (`ofl/archivo/Archivo[wdth,wght].ttf`, google/fonts) instanced at wdth 125 per weight with fontTools, latin subset, family renamed "Archivo Expanded" (a Modified Version; Archivo declares no Reserved Font Name) | SIL OFL 1.1 | 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo) |
| Montserrat Alternates | `montserrat-alternates-{400,500,600,700,800}.woff` | `@fontsource/montserrat-alternates@5.3.0` | SIL OFL 1.1 | 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat) |
| Instrument Serif | `instrument-serif-400.woff`, `instrument-serif-400-italic.woff` | `@fontsource/instrument-serif@5.3.0` | SIL OFL 1.1 | 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) |
| Playfair Display Italic | `playfair-display-{400,700}-italic.woff` | `@fontsource/playfair-display@5.3.0` | SIL OFL 1.1, Reserved Font Name "Playfair Display" (files unmodified) | 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display) |
| Nunito | `nunito-{400,700,900}.woff` | `@fontsource/nunito@5.3.0` | SIL OFL 1.1 | 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito) |
| Unbounded | `unbounded-{400,700,900}.woff` | `@fontsource/unbounded@5.3.0` | SIL OFL 1.1 | 2022 The Unbounded Project Authors (https://github.com/googlefonts/unbounded) |
| VT323 | `vt323-400.woff` | `@fontsource/vt323@5.3.0` | SIL OFL 1.1 | 2011 The VT323 Project Authors |
| Silkscreen | `silkscreen-{400,700}.woff` | `@fontsource/silkscreen@5.3.0` | SIL OFL 1.1 | 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) |
| Damion | `damion-400.woff` | `@fontsource/damion@5.3.0` | SIL OFL 1.1 | 2014 The Damion Project Authors (https://github.com/googlefonts/damionFont) |
| Space Mono | `space-mono-{400,700}.woff` | `@fontsource/space-mono@5.3.0` | SIL OFL 1.1 | 2016 The Space Mono Project Authors (https://github.com/googlefonts/spacemono) |

Yellowtail (the reference's script face) was not bundled: its licence is Apache 2.0, not OFL.
Damion is the OFL monoline brush script used in its place.

The families bundled before B52 (Inter 400 / 700, Roboto, Open Sans, Lato, DM Sans, Manrope,
Plus Jakarta Sans, Montserrat, Poppins, Raleway, Space Grotesk, Oswald, Bebas Neue, Playfair
Display 400 / 700) came from the same fontsource packages; see each upstream package for its licence.
