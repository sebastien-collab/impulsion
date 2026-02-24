<p align="center">
  <img src="icons/logo.svg" alt="Media Buyer Helper Logo" width="80" height="80">
</p>

<h1 align="center">Media Buyer Helper</h1>

<p align="center">
  <strong>Debugger universel de pixels & detecteur de tech stack</strong><br>
  Verifiez vos implementations de tracking, controlez le consent mode et inspectez n'importe quelle page web — directement depuis votre navigateur.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.3.0-6366F1?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/manifest-v3-green?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/build-aucun-blue?style=flat-square" alt="Pas de build">
  <img src="https://img.shields.io/badge/langues-EN%20%7C%20FR-orange?style=flat-square" alt="EN | FR">
</p>

---

## Qu'est-ce que Media Buyer Helper ?

Media Buyer Helper est une extension Chrome concue pour les **media buyers, growth marketers et web analystes** qui ont besoin d'auditer rapidement les pixels de tracking actifs sur n'importe quel site web.

Ouvrez le popup sur n'importe quelle page et visualisez instantanement chaque pixel detecte, ses evenements, payloads, statut de consentement, tech stack, et plus — sans ouvrir les DevTools.

### Fonctionnalites principales

| Fonctionnalite | Description |
|---|---|
| **Detection de pixels** | Detection en temps reel sur 10+ plateformes publicitaires via une analyse triple couche |
| **Inspecteur d'evenements** | Journal chronologique des evenements avec payloads JSON complets, coloration syntaxique et details depliables |
| **Auditeur Consent** | Verification complete Google Consent Mode V2 — mode basic vs advanced, analyse du timing, rapports d'erreurs/alertes |
| **Ad Libraries** | Liens directs vers les portails de transparence publicitaire pour le domaine courant |
| **Tech Stack** | Detection des CMS, frameworks JS, librairies CSS, CDN et services tiers |
| **Auditeur SEO** | Checklist SEO on-page avec score, structure des titres, meta tags et analyse Open Graph |
| **Outils Dev** | Pipette couleur (avec historique), inspecteur de polices (overlay au survol), capture d'ecran, nettoyage cookies & cache |
| **Mode sombre / clair** | Support complet des themes, sombre par defaut |
| **Bilingue** | Francais & anglais, detection automatique depuis la langue du navigateur |

### Plateformes supportees

<table>
  <tr>
    <td align="center">Google Tag Manager</td>
    <td align="center">Google Analytics 4</td>
    <td align="center">Meta (Facebook)</td>
    <td align="center">TikTok</td>
    <td align="center">LinkedIn</td>
  </tr>
  <tr>
    <td align="center">Pinterest</td>
    <td align="center">Snapchat</td>
    <td align="center">X (Twitter)</td>
    <td align="center">Bing UET</td>
    <td align="center">Google Ads</td>
  </tr>
</table>

---

## Comment ca marche

Media Buyer Helper utilise un **systeme de detection triple couche** pour capturer chaque pixel de tracking, meme ceux charges dynamiquement ou via des tag managers :

1. **Intercepteur JS** — Injecte dans le monde principal de la page a `document_start`, il intercepte les variables globales (`fbq`, `gtag`, `ttq`, etc.) *avant* le chargement de toute librairie de tracking, capturant chaque appel de fonction et ses arguments en temps reel.

2. **Scanner DOM** — Scanne toutes les balises `<script>` et `<noscript>` a la recherche de patterns de pixels connus. S'execute au chargement de la page puis a nouveau apres 3 secondes pour attraper les scripts charges tardivement.

3. **Moniteur reseau** — Ecoute les requetes sortantes vers les domaines de tracking connus via `chrome.webRequest`, capturant les pixels qui contournent completement JavaScript (ex. balises image noscript).

Les trois couches alimentent un store d'etat unifie, offrant une vue complete dans un seul popup.

---

## Installation

### Depuis le Chrome Web Store

Installez directement depuis le [Chrome Web Store](https://chromewebstore.google.com/detail/dhgbmhfobmeeandahabdhikkbmocphcn).

### Installation manuelle (mode developpeur)

#### Etape 1 — Telecharger le code source

**Option A : Cloner le repo**

```bash
git clone https://github.com/sebastien-collab/impulsion.git
```

**Option B : Telecharger en ZIP**

Cliquez sur le bouton vert **Code** en haut de cette page, puis **Download ZIP** et dezippez le dossier.

#### Etape 2 — Charger dans Chrome

1. Ouvrez Chrome et allez sur `chrome://extensions/`
2. Activez le **Mode developpeur** (toggle en haut a droite)
3. Cliquez sur **Charger l'extension non empaquetee**
4. Selectionnez le dossier contenant `manifest.json`
5. L'icone de l'extension apparait dans votre barre d'outils — c'est pret !

> **Astuce :** Epinglez l'extension dans votre barre d'outils pour un acces rapide (cliquez sur l'icone puzzle et epinglez-la).

### Mise a jour

Tirez les derniers changements et rechargez :

```bash
git pull
```

Puis allez sur `chrome://extensions/` et cliquez sur le bouton **recharger** sur la carte de l'extension.

---

## Utilisation

1. Naviguez vers n'importe quel site web
2. Cliquez sur l'icone **Media Buyer Helper** dans votre barre d'outils
3. Parcourez les 5 onglets :
   - **Pixels** — Tous les pixels de tracking detectes et leurs evenements
   - **Consent** — Audit de conformite Google Consent Mode V2
   - **Ad Libraries** — Acces direct aux portails de transparence publicitaire
   - **Stack** — Decouvrez la stack technique du site
   - **SEO** — Analysez les facteurs SEO on-page

La barre d'outils rapide en haut donne un acces instantane a : pipette couleur, inspecteur de polices, nettoyage cookies/cache et captures d'ecran.

Le badge sur l'icone de l'extension affiche le nombre de pixels detectes sur la page courante.

---

## Vie privee

Media Buyer Helper est **100% local et respectueux de la vie privee** :

- Zero requete reseau externe — toute la detection se fait dans votre navigateur
- Aucune collecte de donnees, pas d'analytics, pas de telemetrie
- Toutes les donnees de pixels sont stockees en session storage et supprimees a la fermeture de l'onglet
- Seules vos preferences (theme, langue, historique de couleurs) sont persistees localement

[Politique de confidentialite](https://sebastien-collab.github.io/impulsion/store/privacy-policy.html) complete.

---

## Stack technique

- **JavaScript vanilla** (ES6) — pas de framework, pas de bundler, pas de build
- **Chrome Extensions Manifest V3**
- **CSS pur** avec custom properties pour le theming
- **APIs Chrome** : `webRequest`, `scripting`, `storage`, `cookies`, `browsingData`

---

## Structure du projet

```
├── manifest.json           # Manifeste de l'extension (MV3)
├── background/
│   └── service-worker.js   # Monitoring reseau, gestion d'etat, badge
├── content/
│   ├── content.js          # Scanner DOM + analyse SEO (monde isole)
│   └── injected.js         # Intercepteur JS (monde principal)
├── popup/
│   ├── popup.html          # Interface popup 5 onglets
│   ├── popup.css           # Styles theme sombre/clair
│   └── popup.js            # Logique du popup
├── shared/
│   ├── pixels.js           # Definitions des plateformes
│   ├── techstack.js        # Signatures tech stack
│   ├── i18n.js             # Traductions EN/FR
│   └── icons.js            # Bibliotheque d'icones SVG
├── icons/                  # Icones & logo de l'extension
└── store/                  # Descriptions Web Store & politique de confidentialite
```

---

## Contribuer

Les contributions sont les bienvenues ! N'hesitez pas a ouvrir une issue ou soumettre une pull request.

---

## Licence

Ce projet n'est pas sous licence pour le moment. Tous droits reserves.
