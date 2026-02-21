/**
 * IMPULSE — Content Script (ISOLATED world)
 *
 * Bridges the page context (injected.js) with the background
 * service worker. Also scans the DOM for pixel script tags
 * to extract pixel IDs.
 */
(function() {
  'use strict';

  var MSG_SOURCE = 'IMPULSE_PIXEL_DATA';

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

  // ─── 4. DOM Scanning — extract pixel IDs from script tags ──

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

  // Run DOM scan when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDOM);
  } else {
    scanDOM();
  }

  // Second scan after 3s to catch dynamically loaded scripts
  setTimeout(scanDOM, 3000);

})();
