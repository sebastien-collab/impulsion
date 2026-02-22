/**
 * IMPULSION — Content Script (ISOLATED world)
 *
 * Bridges the page context (injected.js) with the background
 * service worker. Also scans the DOM for pixel script tags
 * to extract pixel IDs.
 */
(function() {
  'use strict';

  var MSG_SOURCE = 'IMPULSION_PIXEL_DATA';

  // ─── 1. Inject the MAIN world script into the page ─────────
  function injectPageScript() {
    try {
      var script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/injected.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      // Extension context might be invalidated
    }
  }

  // Inject immediately (we run at document_start)
  injectPageScript();

  // ─── 2. Listen for messages from injected.js ───────────────
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== MSG_SOURCE) return;

    try {
      chrome.runtime.sendMessage({
        type: event.data.type,
        data: event.data.data,
        timestamp: event.data.timestamp
      });
    } catch (e) {
      // Extension context invalidated (e.g., extension reloaded)
    }
  });

  // ─── 3. Consent Mode V2 — DOM fallback scan ───────────────
  // Scans inline scripts for gtag('consent', ...) patterns that may
  // fire before our MAIN world interceptor is ready.

  var consentScanned = false;

  function scanConsentInlineScripts() {
    if (consentScanned) return;
    consentScanned = true;

    var CONSENT_PARAMS = [
      'ad_storage', 'analytics_storage', 'ad_user_data',
      'ad_personalization', 'functionality_storage',
      'personalization_storage', 'security_storage'
    ];

    var scripts = document.querySelectorAll('script:not([src])');
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || '';
      if (text.indexOf('consent') === -1) continue;

      // Match gtag('consent', 'default', {...}) or gtag('consent', 'update', {...})
      var consentRegex = /gtag\s*\(\s*['"]consent['"]\s*,\s*['"](default|update)['"]\s*,\s*(\{[^}]+\})/g;
      var match;
      while ((match = consentRegex.exec(text)) !== null) {
        var consentType = match[1];
        var paramsStr = match[2];

        // Parse the params object from the matched text
        var params = {};
        for (var p = 0; p < CONSENT_PARAMS.length; p++) {
          var paramRegex = new RegExp(CONSENT_PARAMS[p] + "\\s*:\\s*['\"]?(granted|denied)['\"]?");
          var paramMatch = paramsStr.match(paramRegex);
          if (paramMatch) {
            params[CONSENT_PARAMS[p]] = paramMatch[1];
          }
        }

        try {
          chrome.runtime.sendMessage({
            type: 'consent_dom_scan',
            data: {
              consentType: consentType,
              params: params
            },
            timestamp: Date.now()
          });
        } catch (e) {}
      }
    }
  }

  // ─── 4. Tech Stack Detection (DOM-based) ────────────────────

  function scanTechStack() {
    var techstackScript = chrome.runtime.getURL('shared/techstack.js');
    var script = document.createElement('script');
    script.src = techstackScript;
    script.onload = function() {
      this.remove();
    };
    // We can't access MAIN world globals from ISOLATED world,
    // so we scan DOM elements directly here.

    var detected = [];

    // Scan meta tags
    var metas = document.querySelectorAll('meta[name], meta[property], meta[content]');
    // Scan script srcs
    var scripts = document.querySelectorAll('script[src]');
    var scriptSrcs = [];
    for (var s = 0; s < scripts.length; s++) {
      scriptSrcs.push(scripts[s].src || '');
    }
    // Scan link hrefs
    var links = document.querySelectorAll('link[href]');
    var linkHrefs = [];
    for (var l = 0; l < links.length; l++) {
      linkHrefs.push(links[l].href || '');
    }
    // Scan HTML attributes
    var htmlEl = document.documentElement;
    var bodyEl = document.body;

    // Build a simple tech detection using known patterns
    // (We inline the patterns here since IMPULSION_TECHSTACK is in MAIN world)
    var techPatterns = [
      // CMS / Platform
      { name: 'WordPress', category: 'cms', color: '#21759B', icon: 'W',
        metaName: 'generator', metaMatch: /wordpress/i, scriptMatch: /wp-content|wp-includes/i },
      { name: 'Shopify', category: 'cms', color: '#96BF48', icon: 'S',
        metaName: 'generator', metaMatch: /shopify/i, scriptMatch: /cdn\.shopify\.com/i },
      { name: 'Wix', category: 'cms', color: '#0C6EFC', icon: 'Wx',
        metaName: 'generator', metaMatch: /wix\.com/i, scriptMatch: /static\.parastorage\.com|static\.wixstatic\.com/i },
      { name: 'Squarespace', category: 'cms', color: '#222222', icon: 'Sq',
        metaName: 'generator', metaMatch: /squarespace/i, scriptMatch: /squarespace\.com\/universal/i },
      { name: 'Webflow', category: 'cms', color: '#4353FF', icon: 'Wf',
        metaName: 'generator', metaMatch: /webflow/i, scriptMatch: /assets\.website-files\.com|webflow\.js/i },
      { name: 'PrestaShop', category: 'cms', color: '#DF0067', icon: 'Ps',
        metaName: 'generator', metaMatch: /prestashop/i, scriptMatch: /prestashop/i },
      { name: 'Magento', category: 'cms', color: '#F26322', icon: 'Mg',
        metaName: 'generator', metaMatch: /magento/i, scriptMatch: /mage\/|magento/i },
      // JS Frameworks
      { name: 'React', category: 'js_framework', color: '#61DAFB', icon: 'Re',
        htmlAttr: 'data-reactroot', idAttr: '__next' },
      { name: 'Next.js', category: 'js_framework', color: '#000000', icon: 'Nx',
        idAttr: '__next', scriptMatch: /_next\/static/i },
      { name: 'Vue.js', category: 'js_framework', color: '#4FC08D', icon: 'V',
        htmlAttr: 'data-v-', idAttr: '__nuxt', scriptMatch: /vue\.min\.js|vue\.js|vue\.runtime/i },
      { name: 'Nuxt', category: 'js_framework', color: '#00DC82', icon: 'Nu',
        idAttr: '__nuxt', scriptMatch: /_nuxt\//i },
      { name: 'Angular', category: 'js_framework', color: '#DD0031', icon: 'Ng',
        htmlAttr: 'ng-version', scriptMatch: /angular/i },
      { name: 'Svelte', category: 'js_framework', color: '#FF3E00', icon: 'Sv',
        scriptMatch: /svelte/i },
      { name: 'Gatsby', category: 'js_framework', color: '#663399', icon: 'Ga',
        metaName: 'generator', metaMatch: /gatsby/i, idAttr: '___gatsby' },
      { name: 'jQuery', category: 'js_framework', color: '#0769AD', icon: '$',
        scriptMatch: /jquery[\.-]?\d|jquery\.min\.js/i },
      // CSS Frameworks
      { name: 'Tailwind CSS', category: 'css_framework', color: '#06B6D4', icon: 'Tw',
        linkMatch: /tailwind/i, scriptMatch: /tailwind/i },
      { name: 'Bootstrap', category: 'css_framework', color: '#7952B3', icon: 'Bs',
        linkMatch: /bootstrap/i, scriptMatch: /bootstrap/i },
      { name: 'Material UI', category: 'css_framework', color: '#007FFF', icon: 'Mu',
        scriptMatch: /material-ui|@mui/i, linkMatch: /material/i },
      { name: 'Bulma', category: 'css_framework', color: '#00D1B2', icon: 'Bu',
        linkMatch: /bulma/i },
      // CDN / Infrastructure
      { name: 'Cloudflare', category: 'cdn', color: '#F38020', icon: 'Cf',
        scriptMatch: /cdnjs\.cloudflare\.com|cloudflare/i },
      { name: 'Vercel', category: 'cdn', color: '#000000', icon: 'Vc',
        scriptMatch: /vercel/i },
      { name: 'Netlify', category: 'cdn', color: '#00C7B7', icon: 'Nl',
        scriptMatch: /netlify/i },
      { name: 'AWS', category: 'cdn', color: '#FF9900', icon: 'Aw',
        scriptMatch: /amazonaws\.com/i },
      // Tools & Services
      { name: 'HubSpot', category: 'tool', color: '#FF7A59', icon: 'Hs',
        scriptMatch: /js\.hs-scripts\.com|js\.hsforms\.net|hubspot/i },
      { name: 'Intercom', category: 'tool', color: '#1F8DED', icon: 'Ic',
        scriptMatch: /widget\.intercom\.io|intercom/i },
      { name: 'Hotjar', category: 'tool', color: '#FD3A5C', icon: 'Hj',
        scriptMatch: /static\.hotjar\.com|hotjar/i },
      { name: 'reCAPTCHA', category: 'tool', color: '#4285F4', icon: 'Re',
        scriptMatch: /google\.com\/recaptcha|recaptcha/i },
      { name: 'Stripe', category: 'tool', color: '#635BFF', icon: 'St',
        scriptMatch: /js\.stripe\.com|stripe/i },
      { name: 'Crisp', category: 'tool', color: '#1972F5', icon: 'Cr',
        scriptMatch: /client\.crisp\.chat/i },
      { name: 'Drift', category: 'tool', color: '#0176FF', icon: 'Dr',
        scriptMatch: /js\.driftt\.com|drift/i },
      { name: 'Google Maps', category: 'tool', color: '#4285F4', icon: 'Gm',
        scriptMatch: /maps\.googleapis\.com|maps\.google\.com/i },
      { name: 'Cookiebot', category: 'tool', color: '#1769FF', icon: 'Cb',
        scriptMatch: /consent\.cookiebot\.com|cookiebot/i },
      { name: 'OneTrust', category: 'tool', color: '#1F6B2B', icon: 'Ot',
        scriptMatch: /cdn\.cookielaw\.org|onetrust/i }
    ];

    for (var t = 0; t < techPatterns.length; t++) {
      var tp = techPatterns[t];
      var found = false;
      var via = '';
      var version = null;

      // Check meta tags
      if (tp.metaName && tp.metaMatch) {
        for (var m = 0; m < metas.length; m++) {
          var metaName = (metas[m].getAttribute('name') || '').toLowerCase();
          var metaContent = metas[m].getAttribute('content') || '';
          if (metaName === tp.metaName.toLowerCase() && tp.metaMatch.test(metaContent)) {
            found = true;
            via = 'meta';
            // Try extracting version from generator meta
            var vMatch = metaContent.match(/[\d]+\.[\d]+(?:\.[\d]+)?/);
            if (vMatch) version = vMatch[0];
            break;
          }
        }
      }

      // Check script srcs
      if (!found && tp.scriptMatch) {
        for (var si = 0; si < scriptSrcs.length; si++) {
          if (tp.scriptMatch.test(scriptSrcs[si])) {
            found = true;
            via = 'script';
            break;
          }
        }
      }

      // Check link hrefs
      if (!found && tp.linkMatch) {
        for (var li = 0; li < linkHrefs.length; li++) {
          if (tp.linkMatch.test(linkHrefs[li])) {
            found = true;
            via = 'link';
            break;
          }
        }
      }

      // Check HTML attributes
      if (!found && tp.htmlAttr) {
        if (htmlEl && htmlEl.hasAttribute(tp.htmlAttr)) {
          found = true;
          via = 'html_attr';
          var attrVal = htmlEl.getAttribute(tp.htmlAttr);
          if (attrVal && /^\d/.test(attrVal)) version = attrVal;
        } else if (bodyEl) {
          // Check for data-v- style attributes (Vue)
          if (tp.htmlAttr === 'data-v-') {
            var attrs = bodyEl.attributes;
            for (var a = 0; a < attrs.length; a++) {
              if (attrs[a].name.indexOf('data-v-') === 0) {
                found = true;
                via = 'html_attr';
                break;
              }
            }
          } else if (bodyEl.hasAttribute(tp.htmlAttr)) {
            found = true;
            via = 'html_attr';
          }
        }
      }

      // Check element by ID
      if (!found && tp.idAttr) {
        if (document.getElementById(tp.idAttr)) {
          found = true;
          via = 'dom_id';
        }
      }

      if (found) {
        detected.push({
          name: tp.name,
          category: tp.category,
          color: tp.color,
          icon: tp.icon,
          version: version,
          detectedVia: via
        });
      }
    }

    if (detected.length > 0) {
      try {
        chrome.runtime.sendMessage({
          type: 'techstack_results',
          data: detected,
          timestamp: Date.now()
        });
      } catch (e) {}
    }
  }

  // ─── 5. Font Inspector ──────────────────────────────────────

  var fontInspectorActive = false;
  var fontTooltip = null;
  var fontMoveHandler = null;

  function activateFontInspector() {
    if (fontInspectorActive) return;
    fontInspectorActive = true;

    fontTooltip = document.createElement('div');
    fontTooltip.id = 'impulsion-font-tooltip';
    fontTooltip.style.cssText = 'position:fixed;z-index:2147483647;padding:8px 12px;background:#1a1a2e;color:#e0e0e0;' +
      'border-radius:6px;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;' +
      'display:none;box-shadow:0 4px 12px rgba(0,0,0,0.4);border:1px solid rgba(99,102,241,0.3);max-width:300px;';
    document.body.appendChild(fontTooltip);

    fontMoveHandler = function(e) {
      var el = e.target;
      if (el === fontTooltip || el.id === 'impulsion-font-tooltip') return;

      var style = window.getComputedStyle(el);
      var info = '<b style="color:#6366F1">' + style.fontFamily.split(',')[0].replace(/['"]/g, '') + '</b><br>' +
        'Size: ' + style.fontSize + '<br>' +
        'Weight: ' + style.fontWeight + '<br>' +
        'Line-height: ' + style.lineHeight + '<br>' +
        'Color: ' + style.color + '<br>' +
        'Letter-spacing: ' + style.letterSpacing;

      fontTooltip.innerHTML = info;
      fontTooltip.style.display = 'block';

      var x = e.clientX + 15;
      var y = e.clientY + 15;
      if (x + 300 > window.innerWidth) x = e.clientX - 315;
      if (y + 150 > window.innerHeight) y = e.clientY - 155;
      fontTooltip.style.left = x + 'px';
      fontTooltip.style.top = y + 'px';
    };

    document.addEventListener('mousemove', fontMoveHandler, true);
  }

  function deactivateFontInspector() {
    fontInspectorActive = false;
    if (fontMoveHandler) {
      document.removeEventListener('mousemove', fontMoveHandler, true);
      fontMoveHandler = null;
    }
    if (fontTooltip && fontTooltip.parentNode) {
      fontTooltip.parentNode.removeChild(fontTooltip);
      fontTooltip = null;
    }
  }

  // Listen for font inspector toggle messages from popup
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'font_inspector_on') {
      activateFontInspector();
    } else if (message.type === 'font_inspector_off') {
      deactivateFontInspector();
    }
  });

  // ─── 6. DOM Scanning — extract pixel IDs from script tags ──

  function scanDOM() {
    var detected = [];
    var scripts = document.querySelectorAll('script[src], script:not([src])');

    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      var src = script.src || '';
      var text = script.textContent || '';
      var match;

      // --- Google Tag Manager ---
      match = src.match(/googletagmanager\.com\/gtm\.js\?[^"']*id=(GTM-[A-Z0-9]+)/);
      if (match) {
        detected.push({ platform: 'gtm', id: match[1], source: 'script_src' });
      }
      match = text.match(/GTM-[A-Z0-9]{4,8}/);
      if (match && (text.indexOf('googletagmanager') !== -1 || text.indexOf('gtm') !== -1)) {
        detected.push({ platform: 'gtm', id: match[0], source: 'inline' });
      }

      // --- Google Analytics 4 ---
      match = src.match(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]+)/);
      if (match) {
        detected.push({ platform: 'ga4', id: match[1], source: 'script_src' });
      }
      if (text.indexOf('gtag') !== -1) {
        var ga4Matches = text.match(/['"]?(G-[A-Z0-9]{6,12})['"]?/g);
        if (ga4Matches) {
          for (var g = 0; g < ga4Matches.length; g++) {
            var cleanId = ga4Matches[g].replace(/['"]/g, '');
            if (/^G-[A-Z0-9]{6,12}$/.test(cleanId)) {
              detected.push({ platform: 'ga4', id: cleanId, source: 'inline' });
            }
          }
        }
      }

      // --- Google Ads ---
      match = text.match(/AW-\d{7,12}(?:\/[A-Za-z0-9_-]+)?/);
      if (match) {
        detected.push({ platform: 'gads', id: match[0], source: 'inline' });
      }
      match = src.match(/googletagmanager\.com\/gtag\/js\?id=(AW-\d+)/);
      if (match) {
        detected.push({ platform: 'gads', id: match[1], source: 'script_src' });
      }

      // --- Meta Pixel ---
      if (src.indexOf('connect.facebook.net') !== -1 && src.indexOf('fbevents') !== -1) {
        detected.push({ platform: 'meta', id: null, source: 'script_src' });
      }
      match = text.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{15,16})['"]/);
      if (match) {
        detected.push({ platform: 'meta', id: match[1], source: 'inline' });
      }

      // --- TikTok ---
      if (src.indexOf('analytics.tiktok.com') !== -1) {
        detected.push({ platform: 'tiktok', id: null, source: 'script_src' });
      }
      match = text.match(/ttq\.load\s*\(\s*['"]([A-Z0-9]+)['"]/);
      if (match) {
        detected.push({ platform: 'tiktok', id: match[1], source: 'inline' });
      }

      // --- LinkedIn ---
      if (src.indexOf('snap.licdn.com') !== -1) {
        detected.push({ platform: 'linkedin', id: null, source: 'script_src' });
      }
      match = text.match(/_linkedin_data_partner_ids?\s*(?:=\s*\[?\s*|\.push\s*\(\s*)['"]?(\d{4,10})['"]?/);
      if (match) {
        detected.push({ platform: 'linkedin', id: match[1], source: 'inline' });
      }

      // --- Pinterest ---
      if (src.indexOf('pinimg.com/ct/core.js') !== -1) {
        detected.push({ platform: 'pinterest', id: null, source: 'script_src' });
      }
      match = text.match(/pintrk\s*\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/);
      if (match) {
        detected.push({ platform: 'pinterest', id: match[1], source: 'inline' });
      }

      // --- Snapchat ---
      if (src.indexOf('sc-static.net/scevent') !== -1) {
        detected.push({ platform: 'snapchat', id: null, source: 'script_src' });
      }
      match = text.match(/snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]+)['"]/);
      if (match) {
        detected.push({ platform: 'snapchat', id: match[1], source: 'inline' });
      }

      // --- Twitter/X ---
      if (src.indexOf('ads-twitter.com') !== -1) {
        detected.push({ platform: 'twitter', id: null, source: 'script_src' });
      }
      match = text.match(/twq\s*\(\s*['"]init['"]\s*,\s*['"]([a-z0-9]+)['"]/);
      if (match) {
        detected.push({ platform: 'twitter', id: match[1], source: 'inline' });
      }

      // --- Bing UET ---
      if (src.indexOf('bat.bing.com') !== -1) {
        detected.push({ platform: 'bing', id: null, source: 'script_src' });
      }
      match = text.match(/uetq\b.*?\bti\s*:\s*['"](\d+)['"]/);
      if (match) {
        detected.push({ platform: 'bing', id: match[1], source: 'inline' });
      }
    }

    // Check noscript iframes (GTM fallback)
    var noscripts = document.querySelectorAll('noscript');
    for (var n = 0; n < noscripts.length; n++) {
      var html = noscripts[n].innerHTML || '';
      match = html.match(/googletagmanager\.com\/ns\.html\?id=(GTM-[A-Z0-9]+)/);
      if (match) {
        detected.push({ platform: 'gtm', id: match[1], source: 'noscript' });
      }
    }

    // --- Consent Mode V2 (DOM fallback scan) ---
    scanConsentInlineScripts();

    // Deduplicate
    var unique = [];
    var seen = {};
    for (var d = 0; d < detected.length; d++) {
      var key = detected[d].platform + ':' + (detected[d].id || 'null') + ':' + detected[d].source;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(detected[d]);
      }
    }

    if (unique.length > 0) {
      try {
        chrome.runtime.sendMessage({
          type: 'dom_scan_results',
          data: unique,
          timestamp: Date.now()
        });
      } catch (e) {}
    }
  }

  // Run DOM scan + tech stack scan when ready
  function runAllScans() {
    scanDOM();
    scanTechStack();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAllScans);
  } else {
    runAllScans();
  }

  // Second scan after 3s to catch dynamically loaded scripts
  setTimeout(runAllScans, 3000);

})();
