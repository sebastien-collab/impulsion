/**
 * IMPULSION — Page Context Interceptor (MAIN world)
 *
 * Runs in the actual page JavaScript context to intercept tracking
 * pixel function calls. Must execute at document_start BEFORE any
 * pixel library loads.
 *
 * Communication: sends data to content.js via window.postMessage
 */
(function() {
  'use strict';

  // Guard against double execution
  if (window.__IMPULSION_INJECTED__) return;
  window.__IMPULSION_INJECTED__ = true;

  var MSG_SOURCE = 'IMPULSION_PIXEL_DATA';

  // ─── Utility: Send data to content script ──────────────────
  function emit(type, data) {
    window.postMessage({
      source: MSG_SOURCE,
      type: type,
      data: data,
      timestamp: Date.now()
    }, '*');
  }

  // ─── Utility: Safe serialization ───────────────────────────
  function safeSerialize(obj, maxDepth) {
    if (maxDepth === undefined) maxDepth = 4;
    var seen = new WeakSet();
    try {
      return JSON.parse(JSON.stringify(obj, function(key, value) {
        if (typeof value === 'function') return '[Function]';
        if (value instanceof HTMLElement) return '[Element: ' + value.tagName + ']';
        if (value instanceof Event) return '[Event: ' + value.type + ']';
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      }));
    } catch (e) {
      try {
        return String(obj);
      } catch (e2) {
        return '[Unserializable]';
      }
    }
  }

  // ─── Utility: Safe clone of arguments to array ─────────────
  function argsToArray(args) {
    var result = [];
    for (var i = 0; i < args.length; i++) {
      result.push(args[i]);
    }
    return result;
  }

  // ─── Strategy 1: Wrap an existing function ─────────────────
  function wrapFunction(parent, funcName, label, platform) {
    if (typeof parent[funcName] !== 'function') return false;
    if (parent[funcName].__impulsion_wrapped__) return false;

    var original = parent[funcName];
    parent[funcName] = function() {
      var args = argsToArray(arguments);
      emit('event_captured', {
        platform: platform,
        fn: label,
        args: safeSerialize(args)
      });
      return original.apply(this, args);
    };
    parent[funcName].__impulsion_wrapped__ = true;

    // Preserve properties from the original function
    var props = Object.keys(original);
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      if (prop !== '__impulsion_wrapped__') {
        try { parent[funcName][prop] = original[prop]; } catch(e) {}
      }
    }

    // Preserve queue if it exists (fbq.queue, pintrk.queue, etc.)
    if (original.queue) {
      parent[funcName].queue = original.queue;
    }
    if (original.loaded) {
      parent[funcName].loaded = original.loaded;
    }
    if (original.version) {
      parent[funcName].version = original.version;
    }

    return true;
  }

  // ─── Strategy 2: Intercept array .push() ───────────────────
  function interceptArrayPush(arrayName, platform) {
    function doIntercept() {
      var arr = window[arrayName];
      if (!arr || typeof arr.push !== 'function') return false;
      if (arr.push.__impulsion_wrapped__) return false;

      var originalPush = arr.push;
      arr.push = function() {
        var args = argsToArray(arguments);
        emit('event_captured', {
          platform: platform,
          fn: arrayName + '.push',
          args: safeSerialize(args)
        });
        return originalPush.apply(this, args);
      };
      arr.push.__impulsion_wrapped__ = true;
      return true;
    }

    // If array already exists, intercept now
    if (window[arrayName]) {
      // Send existing items as events (they were pushed before we loaded)
      var existing = window[arrayName];
      if (Array.isArray(existing) && existing.length > 0) {
        for (var i = 0; i < existing.length; i++) {
          emit('event_captured', {
            platform: platform,
            fn: arrayName + '.push (pre-existing)',
            args: safeSerialize([existing[i]])
          });
        }
      }
      doIntercept();
      emit('global_found', { platform: platform, global: arrayName });
      return;
    }

    // Array doesn't exist yet — set a trap for when it's created
    var _value = undefined;
    var trapped = false;
    try {
      Object.defineProperty(window, arrayName, {
        configurable: true,
        enumerable: true,
        get: function() { return _value; },
        set: function(newValue) {
          _value = newValue;
          if (!trapped) {
            trapped = true;
            emit('global_found', { platform: platform, global: arrayName });
            // Defer interception to let the library finish initializing
            setTimeout(function() { doIntercept(); }, 0);
          }
        }
      });
    } catch (e) {
      // defineProperty can fail if the property is already defined
    }
  }

  // ─── Strategy 3: Trap a global variable assignment ─────────
  function trapGlobal(globalName, platform, functionsToWrap) {
    // If already exists, handle immediately
    if (window[globalName] !== undefined && window[globalName] !== null) {
      emit('global_found', {
        platform: platform,
        global: globalName,
        existed: true
      });

      // Wrap functions on the existing global
      if (functionsToWrap) {
        for (var i = 0; i < functionsToWrap.length; i++) {
          var def = functionsToWrap[i];
          var parts = def.path.split('.');
          if (parts.length === 1) {
            wrapFunction(window, parts[0], def.label, platform);
          } else {
            var parent = window[parts[0]];
            if (parent && parts.length === 2) {
              wrapFunction(parent, parts[1], def.label, platform);
            }
          }
        }
      }
      return;
    }

    // Not yet defined — set a property trap
    var _value = undefined;
    var trapped = false;

    try {
      Object.defineProperty(window, globalName, {
        configurable: true,
        enumerable: true,
        get: function() { return _value; },
        set: function(newValue) {
          _value = newValue;

          if (!trapped) {
            trapped = true;
            emit('global_found', {
              platform: platform,
              global: globalName,
              type: typeof newValue
            });
          }

          // Wrap functions after the library initializes
          if (functionsToWrap && functionsToWrap.length > 0) {
            setTimeout(function() {
              for (var i = 0; i < functionsToWrap.length; i++) {
                var def = functionsToWrap[i];
                var parts = def.path.split('.');
                if (parts.length === 1) {
                  wrapFunction(window, parts[0], def.label, platform);
                } else if (parts.length === 2) {
                  var parent = window[parts[0]];
                  if (parent) {
                    wrapFunction(parent, parts[1], def.label, platform);
                  }
                }
              }
            }, 0);
          }
        }
      });
    } catch (e) {
      // Silently fail if property can't be defined
    }
  }

  // ─────────────────────────────────────────────────────────────
  // INITIALIZE ALL TRAPS
  // ─────────────────────────────────────────────────────────────

  // --- GTM: dataLayer (array) + google_tag_manager (object) ---
  interceptArrayPush('dataLayer', 'gtm');
  trapGlobal('google_tag_manager', 'gtm', []);

  // --- GA4 + Google Ads: share the gtag function ---
  // We intercept gtag globally, then classify in the service worker
  trapGlobal('gtag', 'ga4', [
    { path: 'gtag', label: 'gtag' }
  ]);

  // --- Meta Pixel ---
  trapGlobal('fbq', 'meta', [
    { path: 'fbq', label: 'fbq' }
  ]);
  trapGlobal('_fbq', 'meta', []);

  // --- TikTok ---
  trapGlobal('ttq', 'tiktok', [
    { path: 'ttq.load', label: 'ttq.load' },
    { path: 'ttq.page', label: 'ttq.page' },
    { path: 'ttq.track', label: 'ttq.track' },
    { path: 'ttq.identify', label: 'ttq.identify' }
  ]);

  // --- LinkedIn ---
  trapGlobal('_linkedin_data_partner_ids', 'linkedin', []);
  trapGlobal('_linkedin_data_partner_id', 'linkedin', []);

  // --- Pinterest ---
  trapGlobal('pintrk', 'pinterest', [
    { path: 'pintrk', label: 'pintrk' }
  ]);

  // --- Snapchat ---
  trapGlobal('snaptr', 'snapchat', [
    { path: 'snaptr', label: 'snaptr' }
  ]);

  // --- Twitter/X ---
  trapGlobal('twq', 'twitter', [
    { path: 'twq', label: 'twq' }
  ]);

  // --- Microsoft UET (array-like) ---
  interceptArrayPush('uetq', 'bing');

  // ─────────────────────────────────────────────────────────────
  // GTM INTERNAL CONSENT STATE (google_tag_data.ics)
  // ─────────────────────────────────────────────────────────────
  // When consent mode is configured via GTM's built-in consent
  // (e.g., Cookiebot CMP tag template, OneTrust, Didomi), the
  // default consent state is stored internally in
  // google_tag_data.ics.entries and never surfaces as a visible
  // gtag() or dataLayer.push() call. We poll this object.

  var CONSENT_KEYS = [
    'ad_storage', 'analytics_storage', 'ad_user_data',
    'ad_personalization', 'functionality_storage',
    'personalization_storage', 'security_storage'
  ];

  var _icsLastSignature = '';

  function parseICSEntryState(entry) {
    if (typeof entry === 'string') return entry;
    if (typeof entry !== 'object' || entry === null) return null;

    // Known property names in GTM's internal structure
    if (entry.default !== undefined) return entry.default;

    // GTM minified property — look for any 'granted' or 'denied' value
    var keys = Object.keys(entry);
    for (var i = 0; i < keys.length; i++) {
      var val = entry[keys[i]];
      if (val === 'granted' || val === 'denied') return val;
    }
    return null;
  }

  function pollGTMConsent() {
    try {
      var gtd = window.google_tag_data;
      if (!gtd || !gtd.ics) return;

      var entries = gtd.ics.entries;
      if (!entries) return;

      var params = {};
      var hasAny = false;

      for (var i = 0; i < CONSENT_KEYS.length; i++) {
        var key = CONSENT_KEYS[i];
        var entry = entries[key];
        if (entry === undefined) continue;

        var state = parseICSEntryState(entry);
        if (state) {
          params[key] = state;
          hasAny = true;
        }
      }

      if (!hasAny) return;

      // Only emit if state changed since last poll
      var sig = JSON.stringify(params);
      if (sig === _icsLastSignature) return;

      var isUpdate = _icsLastSignature !== '';
      _icsLastSignature = sig;

      emit('consent_gtm_internal', {
        consentType: isUpdate ? 'update' : 'default',
        params: params
      });
    } catch (e) {}
  }

  // Listen for CMP-specific events that signal consent changes
  function setupCMPListeners() {
    // Cookiebot
    window.addEventListener('CookiebotOnAccept', function() {
      setTimeout(pollGTMConsent, 100);
    });
    window.addEventListener('CookiebotOnDecline', function() {
      setTimeout(pollGTMConsent, 100);
    });
    // OneTrust
    window.addEventListener('consent.onetrust', function() {
      setTimeout(pollGTMConsent, 100);
    });
    // Didomi
    window.addEventListener('didomi-consent-changed', function() {
      setTimeout(pollGTMConsent, 100);
    });
    // Generic: GTM consent update event in dataLayer
    window.addEventListener('message', function(e) {
      if (e.data && e.data.event === 'cookie_consent_update') {
        setTimeout(pollGTMConsent, 100);
      }
    });
  }

  setupCMPListeners();

  // Poll at increasing intervals to catch when GTM populates ics
  setTimeout(pollGTMConsent, 300);
  setTimeout(pollGTMConsent, 800);
  setTimeout(pollGTMConsent, 1500);
  setTimeout(pollGTMConsent, 3000);
  setTimeout(pollGTMConsent, 6000);

  // ─────────────────────────────────────────────────────────────
  // TECH STACK — Global Variable Detection (MAIN world)
  // ─────────────────────────────────────────────────────────────

  function detectTechGlobals() {
    var detected = [];
    var checks = [
      { global: 'React', alt: '__REACT_DEVTOOLS_GLOBAL_HOOK__', name: 'React', category: 'js_framework', color: '#61DAFB', icon: 'Re' },
      { global: '__NEXT_DATA__', name: 'Next.js', category: 'js_framework', color: '#000000', icon: 'Nx' },
      { global: 'Vue', alt: '__VUE__', name: 'Vue.js', category: 'js_framework', color: '#4FC08D', icon: 'V' },
      { global: '__NUXT__', name: 'Nuxt', category: 'js_framework', color: '#00DC82', icon: 'Nu' },
      { global: 'ng', alt: 'angular', name: 'Angular', category: 'js_framework', color: '#DD0031', icon: 'Ng' },
      { global: '__svelte', alt: '__SVELTE_HMR', name: 'Svelte', category: 'js_framework', color: '#FF3E00', icon: 'Sv' },
      { global: '___gatsby', name: 'Gatsby', category: 'js_framework', color: '#663399', icon: 'Ga' },
      { global: 'jQuery', alt: '$', name: 'jQuery', category: 'js_framework', color: '#0769AD', icon: '$' },
      { global: 'Shopify', name: 'Shopify', category: 'cms', color: '#96BF48', icon: 'S' },
      { global: 'Wix', name: 'Wix', category: 'cms', color: '#0C6EFC', icon: 'Wx' },
      { global: 'Squarespace', name: 'Squarespace', category: 'cms', color: '#222222', icon: 'Sq' },
      { global: 'Webflow', name: 'Webflow', category: 'cms', color: '#4353FF', icon: 'Wf' },
      { global: 'HubSpot', alt: '_hsq', name: 'HubSpot', category: 'tool', color: '#FF7A59', icon: 'Hs' },
      { global: 'Intercom', name: 'Intercom', category: 'tool', color: '#1F8DED', icon: 'Ic' },
      { global: 'hj', alt: '_hjSettings', name: 'Hotjar', category: 'tool', color: '#FD3A5C', icon: 'Hj' },
      { global: 'Stripe', name: 'Stripe', category: 'tool', color: '#635BFF', icon: 'St' },
      { global: '$crisp', name: 'Crisp', category: 'tool', color: '#1972F5', icon: 'Cr' },
      { global: 'drift', name: 'Drift', category: 'tool', color: '#0176FF', icon: 'Dr' },
      { global: 'google', sub: 'maps', name: 'Google Maps', category: 'tool', color: '#4285F4', icon: 'Gm' },
      { global: 'Cookiebot', alt: 'CookieConsent', name: 'Cookiebot', category: 'tool', color: '#1769FF', icon: 'Cb' },
      { global: 'OneTrust', name: 'OneTrust', category: 'tool', color: '#1F6B2B', icon: 'Ot' }
    ];

    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      var found = false;
      var version = null;

      try {
        if (window[c.global] !== undefined && window[c.global] !== null) {
          found = true;
          if (window[c.global].version) version = window[c.global].version;
          if (c.global === 'jQuery' && typeof window[c.global].fn === 'object') {
            version = window[c.global].fn.jquery || null;
          }
        }
        if (!found && c.alt && window[c.alt] !== undefined && window[c.alt] !== null) {
          found = true;
        }
        if (!found && c.sub && window[c.global] && window[c.global][c.sub]) {
          found = true;
        }
      } catch (e) {}

      if (found) {
        detected.push({
          name: c.name, category: c.category, color: c.color,
          icon: c.icon, version: version, detectedVia: 'global'
        });
      }
    }

    if (detected.length > 0) {
      emit('techstack_globals', detected);
    }
  }

  setTimeout(detectTechGlobals, 1500);
  setTimeout(detectTechGlobals, 4000);

})();
