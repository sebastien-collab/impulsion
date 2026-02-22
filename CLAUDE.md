# impulsion.com — Chrome Extension

## Description
Debugger universel de pixels et tags de tracking pour media buyers.
Detecte en temps reel les pixels presents sur n'importe quelle page web.
Inclut aussi : detection de tech stack, liens Ad Libraries, outils (Eye Dropper, Font Inspector, Clear Data).

## Plateformes supportees (10)
GTM, GA4, Google Ads, Meta Pixel, TikTok, LinkedIn, Pinterest, Snapchat, Twitter/X, Microsoft UET/Bing

## Architecture

### Manifest V3 — Fichiers cles
- `manifest.json` — Configuration de l'extension (permissions, content scripts, service worker)
- `shared/pixels.js` — Definitions centralisees des 10 plateformes (globals, patterns, couleurs)
- `shared/techstack.js` — Definitions de ~30 technologies detectables (CMS, frameworks, CDN, outils)
- `shared/i18n.js` — Traductions EN/FR (systeme i18n avec cles `data-i18n`)
- `shared/icons.js` — Icones SVG pour les onglets et sections
- `content/injected.js` — Intercepteur MAIN world (traps sur les variables globales JS + detection tech globals)
- `content/content.js` — Content script ISOLATED world (bridge postMessage + scan DOM + scanTechStack + font inspector)
- `background/service-worker.js` — Gestion d'etat par onglet, monitoring reseau (webRequest), badge, techstack state
- `popup/popup.html` + `popup.css` + `popup.js` — Interface utilisateur (theme sombre, 5 onglets)
- `icons/` — Icones 16/48/128px

### Interface — 5 onglets
1. **Pixels** — Detection et timeline des pixels de tracking (10 plateformes)
2. **Consent** — Verification Google Consent Mode V2 (default/update, Basic/Advanced)
3. **Ad Libraries** — Liens directs vers Meta/Google/LinkedIn/TikTok Ad Libraries pour le domaine courant
4. **Stack** — Detection de tech stack (CMS, frameworks JS/CSS, CDN, outils) style Wappalyzer
5. **Tools** — Eye Dropper (pipette couleur), Font Inspector (WhatFont-like), Clear cookies/cache

### Triple detection (pixels)
1. **Interception JS (MAIN world)** — `Object.defineProperty` sur les globales (`fbq`, `gtag`, `ttq`...) + intercept des appels de fonctions
2. **Scan DOM (ISOLATED world)** — Extraction des IDs depuis les balises `<script>` et `<noscript>`
3. **Monitoring reseau** — `chrome.webRequest.onBeforeRequest` sur les domaines de tracking

### Detection tech stack
1. **Scan DOM (ISOLATED world)** — meta tags, script src, link href, attributs HTML, IDs d'elements
2. **Detection globals (MAIN world)** — variables globales JS (React, Vue, jQuery, Shopify, etc.)

### Flux de donnees
`injected.js` (MAIN) → `postMessage` → `content.js` (ISOLATED) → `chrome.runtime.sendMessage` → `service-worker.js` → `chrome.storage.session`

### i18n
- Langue stockee dans `chrome.storage.local` (cle `impulsion_lang`)
- Detection automatique de la langue du navigateur au premier lancement
- Toggle EN/FR dans le header du popup
- Attributs `data-i18n` sur les elements statiques, `t(key)` pour le rendu dynamique

## Stack technique
- JavaScript vanilla (pas de framework, pas de bundler)
- Chrome Extensions Manifest V3
- `chrome.storage.session` pour la persistance par onglet (pixels, events, consent, techstack)
- `chrome.storage.local` pour les preferences (langue, historique couleurs)
- APIs Chrome : `cookies`, `browsingData`, `scripting`, `webRequest`

## Design
- Theme sombre : fond `#0F1117`
- Accent violet/indigo : `#6366F1`
- Popup : 400x600px
- Coloration syntaxique JSON pour les payloads d'evenements
- Barre d'onglets avec icones SVG + labels 9px
