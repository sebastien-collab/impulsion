/**
 * IMPULSE — Background Service Worker
 *
 * Responsibilities:
 * 1. Register MAIN world content script (injected.js)
 * 2. Monitor network requests via webRequest API
 * 3. Receive pixel data from content scripts
 * 4. Maintain per-tab state (pixels + events)
 * 5. Update toolbar badge
 * 6. Respond to popup queries
 * 7. Track Google Consent Mode V2 state
 */

importScripts('../shared/pixels.js');

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Map<tabId, { pixels: Map<platform, PixelData>, events: Array, consent: Object }>
var tabStore = new Map();

function createEmptyConsentState() {
  return {
    detected: false,
    mode: null,
    defaultFiredAt: null,
    updateFiredAt: null,
    firstTrackingAt: null,
    state: {
      ad_storage: null,
      analytics_storage: null,
      ad_user_data: null,
      ad_personalization: null,
      functionality_storage: null,
      personalization_storage: null,
      security_storage: null
    },
    timeline: [],
    issues: []
  };
}

function getTabData(tabId) {
  if (!tabStore.has(tabId)) {
    tabStore.set(tabId, {
      pixels: new Map(),
      events: [],
      consent: createEmptyConsentState()
    });
  }
  return tabStore.get(tabId);
}

function addPixelDetection(tabId, platform, pixelId, source) {
  var config = self.IMPULSE_PIXELS[platform];
  if (!config) return;

  var tabData = getTabData(tabId);

  if (!tabData.pixels.has(platform)) {
    tabData.pixels.set(platform, {
      platform: platform,
      name: config.name,
      shortName: config.shortName,
      color: config.color,
      iconLetter: config.iconLetter,
      ids: new Set(),
      detectedVia: new Set(),
      firstSeen: Date.now(),
      lastSeen: Date.now()
    });
  }

  var pixel = tabData.pixels.get(platform);
  if (pixelId) pixel.ids.add(pixelId);
  pixel.detectedVia.add(source);
  pixel.lastSeen = Date.now();

  updateBadge(tabId);
  persistTabData(tabId);
}

function addEvent(tabId, platform, eventData) {
  var tabData = getTabData(tabId);

  tabData.events.push({
    platform: platform,
    fn: eventData.fn || eventData.function || 'unknown',
    args: eventData.args || null,
    timestamp: eventData.timestamp || Date.now()
  });

  // Cap at 500 events per tab
  if (tabData.events.length > 500) {
    tabData.events = tabData.events.slice(-500);
  }

  // Mark pixel as detected if not already
  addPixelDetection(tabId, platform, null, 'event');
}

// ═══════════════════════════════════════════════════════════════
// CONSENT MODE V2 DETECTION
// ═══════════════════════════════════════════════════════════════

var CONSENT_PARAMS = [
  'ad_storage', 'analytics_storage', 'ad_user_data',
  'ad_personalization', 'functionality_storage',
  'personalization_storage', 'security_storage'
];

var V2_REQUIRED_PARAMS = ['ad_user_data', 'ad_personalization'];

function isConsentCommand(args) {
  if (!Array.isArray(args)) return false;
  return args.length >= 2
    && args[0] === 'consent'
    && (args[1] === 'default' || args[1] === 'update');
}

function isDataLayerConsentCommand(args) {
  if (!Array.isArray(args)) return false;
  if (args.length < 1) return false;
  var item = args[0];

  // Array form: [['consent', 'default', {...}]]
  if (Array.isArray(item)) {
    return item.length >= 2
      && item[0] === 'consent'
      && (item[1] === 'default' || item[1] === 'update');
  }

  if (typeof item === 'object' && item !== null) {
    // Arguments-as-object form: [{"0": "consent", "1": "default", "2": {...}}]
    // (when gtag pushes Arguments to dataLayer, they serialize with numeric keys)
    if (item['0'] === 'consent' && (item['1'] === 'default' || item['1'] === 'update')) {
      return true;
    }
    // Object form: [{event: 'consent_default'}] or [{event: 'consent_update'}]
    var evt = item.event;
    if (evt === 'consent_default' || evt === 'consent_update') {
      return true;
    }
  }
  return false;
}

function extractConsentData(args, source) {
  var type = null;
  var params = {};

  if (source === 'gtag') {
    type = args[1];
    params = (args.length >= 3 && typeof args[2] === 'object') ? args[2] : {};
  } else if (source === 'dataLayer') {
    var item = args[0];
    if (Array.isArray(item)) {
      // Array form: ['consent', 'default', {...}]
      type = item[1];
      params = (item.length >= 3 && typeof item[2] === 'object') ? item[2] : {};
    } else if (typeof item === 'object' && item !== null) {
      // Arguments-as-object form: {"0": "consent", "1": "default", "2": {...}}
      if (item['0'] === 'consent' && (item['1'] === 'default' || item['1'] === 'update')) {
        type = item['1'];
        params = (typeof item['2'] === 'object' && item['2'] !== null) ? item['2'] : {};
      }
      // Object form: {event: 'consent_default', ad_storage: 'denied', ...}
      else if (item.event === 'consent_default' || item.event === 'consent_update') {
        type = item.event === 'consent_default' ? 'default' : 'update';
        params = {};
        for (var i = 0; i < CONSENT_PARAMS.length; i++) {
          if (item[CONSENT_PARAMS[i]] !== undefined) {
            params[CONSENT_PARAMS[i]] = item[CONSENT_PARAMS[i]];
          }
        }
      }
    }
  }

  var filtered = {};
  for (var j = 0; j < CONSENT_PARAMS.length; j++) {
    var key = CONSENT_PARAMS[j];
    if (params[key] !== undefined) {
      filtered[key] = params[key];
    }
  }

  return { type: type, params: filtered };
}

function handleConsentEvent(tabId, args, source) {
  var tabData = getTabData(tabId);
  var consent = tabData.consent;
  var extracted = extractConsentData(args, source);
  if (!extracted.type) return;

  consent.detected = true;
  var now = Date.now();

  if (extracted.type === 'default' && !consent.defaultFiredAt) {
    consent.defaultFiredAt = now;
  }
  if (extracted.type === 'update' && !consent.updateFiredAt) {
    consent.updateFiredAt = now;
  }

  consent.timeline.push({
    type: extracted.type,
    params: extracted.params,
    timestamp: now,
    source: source
  });

  var paramKeys = Object.keys(extracted.params);
  for (var i = 0; i < paramKeys.length; i++) {
    var key = paramKeys[i];
    if (consent.state.hasOwnProperty(key)) {
      consent.state[key] = extracted.params[key];
    }
  }

  computeConsentMode(consent);
  computeConsentIssues(consent);
  persistTabData(tabId);
}

function trackFirstTrackingEvent(tabId) {
  var tabData = getTabData(tabId);
  if (!tabData.consent.firstTrackingAt) {
    tabData.consent.firstTrackingAt = Date.now();
    computeConsentIssues(tabData.consent);
    persistTabData(tabId);
  }
}

function computeConsentMode(consent) {
  if (!consent.detected) {
    consent.mode = null;
    return;
  }
  if (consent.defaultFiredAt) {
    if (!consent.firstTrackingAt || consent.defaultFiredAt <= consent.firstTrackingAt) {
      consent.mode = 'advanced';
    } else {
      consent.mode = 'basic';
    }
  } else {
    consent.mode = 'basic';
  }
}

function computeConsentIssues(consent) {
  var issues = [];
  if (!consent.detected) {
    consent.issues = issues;
    return;
  }

  if (!consent.defaultFiredAt) {
    issues.push({
      severity: 'error',
      code: 'NO_DEFAULT',
      message: 'No consent default found — consent mode may not be active'
    });
  }

  if (consent.defaultFiredAt && consent.firstTrackingAt
      && consent.defaultFiredAt > consent.firstTrackingAt) {
    issues.push({
      severity: 'error',
      code: 'DEFAULT_AFTER_TRACKING',
      message: 'Consent default fired AFTER tracking events — initial hits not covered'
    });
  }

  var allParamsEverSet = {};
  for (var t = 0; t < consent.timeline.length; t++) {
    var pKeys = Object.keys(consent.timeline[t].params);
    for (var p = 0; p < pKeys.length; p++) {
      allParamsEverSet[pKeys[p]] = true;
    }
  }

  for (var v = 0; v < V2_REQUIRED_PARAMS.length; v++) {
    var req = V2_REQUIRED_PARAMS[v];
    if (!allParamsEverSet[req]) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_V2_' + req.toUpperCase(),
        message: 'Missing ' + req + ' parameter (required for Consent Mode V2)'
      });
    }
  }

  if (consent.defaultFiredAt && !consent.updateFiredAt) {
    issues.push({
      severity: 'warning',
      code: 'NO_UPDATE',
      message: 'No consent update detected — user choices may not be applied'
    });
  }

  if (consent.mode === 'basic') {
    issues.push({
      severity: 'warning',
      code: 'BASIC_MODE',
      message: 'Running in Basic mode — no data sent to Google until consent is granted'
    });
  }

  consent.issues = issues;
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE — chrome.storage.session
// ═══════════════════════════════════════════════════════════════

function persistTabData(tabId) {
  var tabData = tabStore.get(tabId);
  if (!tabData) return;

  var serializable = {
    pixels: {},
    events: tabData.events,
    consent: tabData.consent
  };

  tabData.pixels.forEach(function(pixel, platform) {
    serializable.pixels[platform] = {
      platform: pixel.platform,
      name: pixel.name,
      shortName: pixel.shortName,
      color: pixel.color,
      iconLetter: pixel.iconLetter,
      ids: Array.from(pixel.ids),
      detectedVia: Array.from(pixel.detectedVia),
      firstSeen: pixel.firstSeen,
      lastSeen: pixel.lastSeen
    };
  });

  chrome.storage.session.set({ ['tab_' + tabId]: serializable }).catch(function() {});
}

function restoreTabData(tabId) {
  return chrome.storage.session.get('tab_' + tabId).then(function(result) {
    var stored = result['tab_' + tabId];
    if (!stored) return null;

    var tabData = {
      pixels: new Map(),
      events: stored.events || [],
      consent: stored.consent || createEmptyConsentState()
    };

    Object.keys(stored.pixels).forEach(function(platform) {
      var p = stored.pixels[platform];
      tabData.pixels.set(platform, {
        platform: p.platform,
        name: p.name,
        shortName: p.shortName,
        color: p.color,
        iconLetter: p.iconLetter,
        ids: new Set(p.ids),
        detectedVia: new Set(p.detectedVia),
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen
      });
    });

    tabStore.set(tabId, tabData);
    return tabData;
  }).catch(function() { return null; });
}

// ═══════════════════════════════════════════════════════════════
// BADGE
// ═══════════════════════════════════════════════════════════════

function updateBadge(tabId) {
  var tabData = tabStore.get(tabId);
  var count = tabData ? tabData.pixels.size : 0;

  chrome.action.setBadgeText({
    text: count > 0 ? String(count) : '',
    tabId: tabId
  }).catch(function() {});

  chrome.action.setBadgeBackgroundColor({
    color: count > 0 ? '#6366F1' : '#666666',
    tabId: tabId
  }).catch(function() {});
}

// ═══════════════════════════════════════════════════════════════
// NETWORK MONITORING (webRequest)
// ═══════════════════════════════════════════════════════════════

// Build URL patterns from pixel config
var urlPatterns = self.IMPULSE_URL_FILTERS || ['<all_urls>'];

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.tabId < 0) return; // non-tab requests (e.g., service worker)

    var url = details.url;
    var pixelKeys = Object.keys(self.IMPULSE_PIXELS);

    for (var i = 0; i < pixelKeys.length; i++) {
      var platform = pixelKeys[i];
      var config = self.IMPULSE_PIXELS[platform];

      for (var j = 0; j < config.networkPatterns.length; j++) {
        if (config.networkPatterns[j].test(url)) {
          // Extract pixel ID from URL
          var extractedId = null;
          for (var k = 0; k < config.idPatterns.length; k++) {
            var idMatch = url.match(config.idPatterns[k]);
            if (idMatch) {
              extractedId = idMatch[0];
              break;
            }
          }

          addPixelDetection(details.tabId, platform, extractedId, 'network');
          addEvent(details.tabId, platform, {
            fn: 'network_request',
            args: {
              url: url,
              method: details.method || 'GET',
              type: details.type
            }
          });

          return; // matched — stop checking other platforms for this request
        }
      }
    }
  },
  { urls: urlPatterns }
);

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Messages from content scripts have sender.tab
  var tabId = sender.tab ? sender.tab.id : null;

  // Message from popup (no tab)
  if (!tabId) {
    if (message.type === 'get_tab_data') {
      handleGetTabData(message.tabId, sendResponse);
      return true; // async response
    }
    return;
  }

  // Messages from content script
  switch (message.type) {

    case 'global_found':
      if (message.data && message.data.platform) {
        addPixelDetection(tabId, message.data.platform, null, 'global:' + (message.data.global || ''));
      }
      break;

    case 'event_captured':
      if (message.data && message.data.platform) {
        var platform = message.data.platform;
        var args = message.data.args;

        // Detect consent commands from gtag
        if (platform === 'ga4' && isConsentCommand(args)) {
          handleConsentEvent(tabId, args, 'gtag');
          addEvent(tabId, platform, { fn: message.data.fn, args: args });
          break;
        }

        // Detect consent commands from dataLayer
        if (platform === 'gtm' && isDataLayerConsentCommand(args)) {
          handleConsentEvent(tabId, args, 'dataLayer');
          addEvent(tabId, platform, { fn: message.data.fn, args: args });
          break;
        }

        // Track first non-consent tracking event for timing analysis
        if (platform === 'ga4' || platform === 'gads') {
          trackFirstTrackingEvent(tabId);
        }

        // Classify gtag calls: GA4 vs Google Ads
        if (platform === 'ga4' && args) {
          var argsStr = typeof args === 'string'
            ? args
            : JSON.stringify(args);
          if (argsStr.indexOf('AW-') !== -1) {
            platform = 'gads';
          }
        }

        addEvent(tabId, platform, {
          fn: message.data.fn,
          args: args
        });

        // Try to extract pixel ID from event args
        extractIdFromArgs(tabId, platform, args);
      }
      break;

    case 'dom_scan_results':
      if (Array.isArray(message.data)) {
        for (var i = 0; i < message.data.length; i++) {
          var item = message.data[i];
          addPixelDetection(tabId, item.platform, item.id, 'dom:' + item.source);
        }
      }
      break;

    case 'consent_dom_scan':
      // Fallback: consent detected via DOM scanning of inline scripts
      if (message.data && message.data.consentType) {
        var tabData = getTabData(tabId);
        var consent = tabData.consent;
        // Only process if not already detected via JS interception
        if (!consent.detected) {
          consent.detected = true;
          var now = Date.now();
          var ct = message.data.consentType;

          if (ct === 'default' && !consent.defaultFiredAt) {
            consent.defaultFiredAt = now;
          }
          if (ct === 'update' && !consent.updateFiredAt) {
            consent.updateFiredAt = now;
          }

          var dp = message.data.params || {};
          consent.timeline.push({
            type: ct,
            params: dp,
            timestamp: now,
            source: 'dom'
          });

          var dpKeys = Object.keys(dp);
          for (var d = 0; d < dpKeys.length; d++) {
            if (consent.state.hasOwnProperty(dpKeys[d])) {
              consent.state[dpKeys[d]] = dp[dpKeys[d]];
            }
          }

          computeConsentMode(consent);
          computeConsentIssues(consent);
          persistTabData(tabId);
        }
      }
      break;
  }
});

function extractIdFromArgs(tabId, platform, args) {
  if (!args) return;
  var config = self.IMPULSE_PIXELS[platform];
  if (!config) return;

  var argsStr = typeof args === 'string' ? args : JSON.stringify(args);

  for (var i = 0; i < config.idPatterns.length; i++) {
    var match = argsStr.match(config.idPatterns[i]);
    if (match) {
      addPixelDetection(tabId, platform, match[0], 'event_args');
      return;
    }
  }
}

function handleGetTabData(tabId, sendResponse) {
  var tabData = tabStore.get(tabId);

  if (tabData) {
    sendResponse(serializeTabData(tabData));
    return;
  }

  // Try restoring from session storage
  restoreTabData(tabId).then(function(restored) {
    if (restored) {
      sendResponse(serializeTabData(restored));
    } else {
      sendResponse({ pixels: [], events: [], consent: createEmptyConsentState() });
    }
  });
}

function serializeTabData(tabData) {
  var pixels = [];
  tabData.pixels.forEach(function(pixel) {
    pixels.push({
      platform: pixel.platform,
      name: pixel.name,
      shortName: pixel.shortName,
      color: pixel.color,
      iconLetter: pixel.iconLetter,
      ids: Array.from(pixel.ids),
      detectedVia: Array.from(pixel.detectedVia),
      firstSeen: pixel.firstSeen,
      lastSeen: pixel.lastSeen
    });
  });

  // Return last 200 events
  var events = tabData.events.slice(-200);

  return { pixels: pixels, events: events, consent: tabData.consent };
}

// ═══════════════════════════════════════════════════════════════
// TAB LIFECYCLE
// ═══════════════════════════════════════════════════════════════

chrome.tabs.onRemoved.addListener(function(tabId) {
  tabStore.delete(tabId);
  chrome.storage.session.remove('tab_' + tabId).catch(function() {});
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (changeInfo.status === 'loading') {
    // Page navigation — clear old data
    tabStore.delete(tabId);
    chrome.storage.session.remove('tab_' + tabId).catch(function() {});
    updateBadge(tabId);
  }
});

// ═══════════════════════════════════════════════════════════════
// INSTALL / STARTUP — Register MAIN world content script
// ═══════════════════════════════════════════════════════════════

async function registerInjectedScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['impulse-injected'] });
  } catch (e) {
    // Not registered yet — that's fine
  }

  await chrome.scripting.registerContentScripts([{
    id: 'impulse-injected',
    matches: ['http://*/*', 'https://*/*'],
    js: ['content/injected.js'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false
  }]);
}

chrome.runtime.onInstalled.addListener(function() {
  registerInjectedScript();
});

chrome.runtime.onStartup.addListener(function() {
  registerInjectedScript();
});
