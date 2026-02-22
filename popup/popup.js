/**
 * IMPULSION — Popup Logic
 *
 * Tabbed UI with i18n support.
 * Tabs: Pixels, Consent, Ad Libraries, Stack, Tools
 */
(function() {
  'use strict';

  var currentTabId = null;
  var currentDomain = null;
  var currentOrigin = null;
  var activeTab = 'pixels';
  var currentLang = 'en';
  var currentTheme = 'dark';
  var cachedData = null;
  var fontInspectorActive = false;

  // ─── Init ──────────────────────────────────────────────────
  async function init() {
    try {
      // Load language preference
      var stored = await chrome.storage.local.get(['lang', 'theme']);
      if (stored.lang) {
        currentLang = stored.lang;
      } else {
        var browserLang = navigator.language || navigator.userLanguage || 'en';
        currentLang = browserLang.startsWith('fr') ? 'fr' : 'en';
      }

      // Load theme preference
      if (stored.theme) {
        currentTheme = stored.theme;
      }

      // Load font inspector state
      var fiState = await chrome.storage.session.get('fontInspectorActive');
      fontInspectorActive = fiState.fontInspectorActive || false;

      // Set up UI
      applyTheme();
      setupThemeToggle();
      applyLanguageToggle();
      setupTabNavigation();
      setupLanguageToggle();
      injectTabIcons();
      applyTranslations();

      // Query active tab
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs[0]) return;

      currentTabId = tabs[0].id;

      // Extract domain
      try {
        var url = new URL(tabs[0].url);
        currentDomain = url.hostname;
        currentOrigin = url.origin;
      } catch (e) {}

      // Request data from service worker
      chrome.runtime.sendMessage(
        { type: 'get_tab_data', tabId: currentTabId },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('impulsion.com:', chrome.runtime.lastError.message);
            return;
          }
          cachedData = response;
          render(response);
        }
      );
    } catch (e) {
      console.error('impulsion.com: init error', e);
    }
  }

  // ─── i18n ───────────────────────────────────────────────────
  function t(key) {
    var strings = window.IMPULSION_I18N;
    if (!strings) return key;
    return (strings[currentLang] && strings[currentLang][key])
      || (strings['en'] && strings['en'][key])
      || key;
  }

  function applyTranslations() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      els[i].textContent = t(key);
    }
  }

  function applyLanguageToggle() {
    var btns = document.querySelectorAll('.lang-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-lang') === currentLang);
    }
  }

  function setupLanguageToggle() {
    var btns = document.querySelectorAll('.lang-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function() {
        var lang = this.getAttribute('data-lang');
        if (lang === currentLang) return;
        currentLang = lang;
        chrome.storage.local.set({ lang: lang });
        applyLanguageToggle();
        applyTranslations();
        if (cachedData) render(cachedData);
      });
    }
  }

  // ─── Theme Toggle ──────────────────────────────────────────

  function applyTheme() {
    document.body.classList.toggle('light', currentTheme === 'light');
    updateThemeIcon();
  }

  function updateThemeIcon() {
    var icons = window.IMPULSION_ICONS || {};
    var el = document.getElementById('themeIcon');
    if (el) el.innerHTML = currentTheme === 'dark' ? icons.sun : icons.moon;
  }

  function setupThemeToggle() {
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', function() {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        chrome.storage.local.set({ theme: currentTheme });
        applyTheme();
      });
    }
  }

  // ─── Tab Navigation ─────────────────────────────────────────
  function setupTabNavigation() {
    var tabBtns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function() {
        switchTab(this.getAttribute('data-tab'));
      });
    }
  }

  function switchTab(tabName) {
    activeTab = tabName;
    var btns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === tabName);
    }
    var panels = document.querySelectorAll('.tab-content');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle('active', panels[i].getAttribute('data-tab') === tabName);
    }
    // Refresh tools tab data when switching to it
    if (tabName === 'tools') {
      loadCookieCount();
    }
  }

  function injectTabIcons() {
    var icons = window.IMPULSION_ICONS;
    if (!icons) return;
    setInnerHTML('tabIconPixels', icons.tab_pixels);
    setInnerHTML('tabIconConsent', icons.tab_consent);
    setInnerHTML('tabIconAdlibs', icons.tab_adlibs);
    setInnerHTML('tabIconStack', icons.tab_stack);
    setInnerHTML('tabIconTools', icons.tab_tools);
  }

  function setInnerHTML(id, html) {
    var el = document.getElementById(id);
    if (el && html) el.innerHTML = html;
  }

  // ─── Main Render ────────────────────────────────────────────
  function render(data) {
    var pixels = (data && data.pixels) || [];
    var events = (data && data.events) || [];
    var consent = (data && data.consent) || null;
    var techstack = (data && data.techstack) || [];

    // Update pixel count
    document.getElementById('pixelCount').textContent = pixels.length;

    // Render all tabs
    renderPixelsTab(pixels, events);
    renderConsentTab(consent);
    renderAdLibsTab();
    renderStackTab(techstack);
    renderToolsTab();
  }

  // ═══════════════════════════════════════════════════════════
  // PIXELS TAB
  // ═══════════════════════════════════════════════════════════

  function renderPixelsTab(pixels, events) {
    renderSummaryBar(pixels);
    renderPixelList(pixels, events);
  }

  function renderSummaryBar(pixels) {
    var bar = document.getElementById('summaryBar');
    bar.innerHTML = '';

    if (pixels.length === 0) return;

    for (var i = 0; i < pixels.length; i++) {
      var p = pixels[i];
      var badge = document.createElement('div');
      badge.className = 'summary-badge';

      var dot = document.createElement('span');
      dot.className = 'badge-dot';
      dot.style.backgroundColor = p.color;

      var label = document.createElement('span');
      label.textContent = p.shortName;

      badge.appendChild(dot);
      badge.appendChild(label);
      bar.appendChild(badge);
    }
  }

  function renderPixelList(pixels, events) {
    var list = document.getElementById('pixelList');
    var emptyState = document.getElementById('emptyState');

    var cards = list.querySelectorAll('.pixel-card');
    for (var c = 0; c < cards.length; c++) {
      cards[c].remove();
    }

    if (pixels.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    for (var i = 0; i < pixels.length; i++) {
      var pixelEvents = filterEvents(events, pixels[i].platform);
      var card = createPixelCard(pixels[i], pixelEvents);
      list.appendChild(card);
    }
  }

  function filterEvents(events, platform) {
    var result = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].platform === platform) {
        result.push(events[i]);
      }
    }
    return result;
  }

  function createPixelCard(pixel, pixelEvents) {
    var card = document.createElement('div');
    card.className = 'pixel-card';

    var header = document.createElement('div');
    header.className = 'pixel-card-header';
    header.addEventListener('click', function() {
      card.classList.toggle('expanded');
    });

    var icon = document.createElement('div');
    icon.className = 'pixel-icon';
    icon.style.backgroundColor = pixel.color;
    if (pixel.color === '#000000') {
      icon.style.backgroundColor = '#1A1A1A';
      icon.style.border = '1px solid #333';
    }
    if (pixel.color === '#FFFC00') {
      icon.style.color = '#000';
    }
    icon.textContent = pixel.iconLetter || pixel.shortName;

    var info = document.createElement('div');
    info.className = 'pixel-info';

    var name = document.createElement('div');
    name.className = 'pixel-name';
    name.textContent = pixel.name;

    var idText = document.createElement('div');
    idText.className = 'pixel-id';
    if (pixel.ids && pixel.ids.length > 0) {
      idText.textContent = pixel.ids.join(', ');
      idText.title = pixel.ids.join('\n');
    } else {
      idText.textContent = t('id_pending');
      idText.style.fontStyle = 'italic';
    }

    info.appendChild(name);
    info.appendChild(idText);

    var meta = document.createElement('div');
    meta.className = 'pixel-meta';

    var status = document.createElement('div');
    status.className = 'pixel-status';

    var eventCount = document.createElement('span');
    eventCount.className = 'pixel-event-count';
    var evtLabel = pixelEvents.length !== 1 ? t('events_plural') : t('events_singular');
    eventCount.textContent = pixelEvents.length + ' ' + evtLabel;

    var chevron = document.createElement('span');
    chevron.className = 'pixel-chevron';
    chevron.innerHTML = '&#9654;';

    meta.appendChild(status);
    meta.appendChild(eventCount);
    meta.appendChild(chevron);

    header.appendChild(icon);
    header.appendChild(info);
    header.appendChild(meta);

    var badges = document.createElement('div');
    badges.className = 'detection-badges';
    if (pixel.detectedVia && pixel.detectedVia.length > 0) {
      for (var d = 0; d < pixel.detectedVia.length; d++) {
        var badge = document.createElement('span');
        badge.className = 'detection-badge';
        badge.textContent = formatDetectionSource(pixel.detectedVia[d]);
        badges.appendChild(badge);
      }
    }

    var eventsContainer = document.createElement('div');
    eventsContainer.className = 'pixel-events';

    var recentEvents = pixelEvents.slice(-50).reverse();

    if (recentEvents.length === 0) {
      var noEvents = document.createElement('div');
      noEvents.className = 'event-item';
      noEvents.innerHTML = '<span class="event-name" style="color:#52525B;font-style:italic">' + escapeHtml(t('no_events')) + '</span>';
      eventsContainer.appendChild(noEvents);
    } else {
      for (var e = 0; e < recentEvents.length; e++) {
        eventsContainer.appendChild(createEventItem(recentEvents[e]));
      }
    }

    card.appendChild(header);
    card.appendChild(badges);
    card.appendChild(eventsContainer);

    return card;
  }

  function createEventItem(evt) {
    var item = document.createElement('div');
    item.className = 'event-item';

    var header = document.createElement('div');
    header.className = 'event-header';
    header.addEventListener('click', function(e) {
      e.stopPropagation();
      item.classList.toggle('expanded');
    });

    var eventName = extractEventName(evt);

    var nameEl = document.createElement('span');
    nameEl.className = 'event-name';
    nameEl.textContent = eventName;

    var funcEl = document.createElement('span');
    funcEl.className = 'event-function';
    funcEl.textContent = evt.fn || '';

    var timeEl = document.createElement('span');
    timeEl.className = 'event-time';
    timeEl.textContent = formatTime(evt.timestamp);

    header.appendChild(nameEl);
    header.appendChild(funcEl);
    header.appendChild(timeEl);

    var payload = document.createElement('div');
    payload.className = 'event-payload';
    payload.innerHTML = syntaxHighlight(evt.args);

    item.appendChild(header);
    item.appendChild(payload);

    return item;
  }

  // ═══════════════════════════════════════════════════════════
  // CONSENT TAB
  // ═══════════════════════════════════════════════════════════

  var CONSENT_PARAM_LABELS = {
    ad_storage:              { label: 'Ad Storage',              v2: false },
    analytics_storage:       { label: 'Analytics Storage',       v2: false },
    ad_user_data:            { label: 'Ad User Data',            v2: true  },
    ad_personalization:      { label: 'Ad Personalization',      v2: true  },
    functionality_storage:   { label: 'Functionality Storage',   v2: false },
    personalization_storage: { label: 'Personalization Storage', v2: false },
    security_storage:        { label: 'Security Storage',        v2: false }
  };

  function renderConsentTab(consent) {
    var section = document.getElementById('consentSection');
    var emptyEl = document.getElementById('consentEmpty');

    if (!consent || !consent.detected) {
      section.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    section.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    // Mode badge
    var modeBadge = document.getElementById('consentModeBadge');
    if (consent.mode === 'advanced') {
      modeBadge.textContent = t('consent_advanced');
      modeBadge.className = 'consent-mode-badge mode-advanced';
    } else if (consent.mode === 'basic') {
      modeBadge.textContent = t('consent_basic');
      modeBadge.className = 'consent-mode-badge mode-basic';
    } else {
      modeBadge.textContent = '';
      modeBadge.className = 'consent-mode-badge';
    }

    // Issue count
    var issueCount = document.getElementById('consentIssueCount');
    var errors = 0;
    var warnings = 0;
    for (var i = 0; i < consent.issues.length; i++) {
      if (consent.issues[i].severity === 'error') errors++;
      else warnings++;
    }
    if (errors > 0) {
      issueCount.textContent = errors + ' error' + (errors > 1 ? 's' : '');
      issueCount.className = 'consent-issue-count issue-error';
    } else if (warnings > 0) {
      issueCount.textContent = warnings + ' warning' + (warnings > 1 ? 's' : '');
      issueCount.className = 'consent-issue-count issue-warning';
    } else {
      issueCount.textContent = 'OK';
      issueCount.className = 'consent-issue-count issue-ok';
    }

    // Toggle expand on header click
    var header = document.getElementById('consentHeader');
    var detail = document.getElementById('consentDetail');
    var newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);
    newHeader.addEventListener('click', function() {
      detail.classList.toggle('hidden');
      newHeader.classList.toggle('expanded');
    });

    renderConsentParams(consent.state);
    renderConsentIssues(consent.issues);
    renderConsentTimeline(consent.timeline);
  }

  function renderConsentParams(state) {
    var container = document.getElementById('consentParams');
    container.innerHTML = '';

    var keys = Object.keys(CONSENT_PARAM_LABELS);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var config = CONSENT_PARAM_LABELS[key];
      var value = state[key];

      var row = document.createElement('div');
      row.className = 'consent-param-row';

      var nameEl = document.createElement('span');
      nameEl.className = 'consent-param-name';
      nameEl.textContent = config.label;
      if (config.v2) {
        var v2Tag = document.createElement('span');
        v2Tag.className = 'consent-v2-tag';
        v2Tag.textContent = 'V2';
        nameEl.appendChild(v2Tag);
      }

      var valueEl = document.createElement('span');
      if (value === 'granted') {
        valueEl.className = 'consent-param-value value-granted';
        valueEl.textContent = 'granted';
      } else if (value === 'denied') {
        valueEl.className = 'consent-param-value value-denied';
        valueEl.textContent = 'denied';
      } else {
        valueEl.className = 'consent-param-value value-unset';
        valueEl.textContent = 'not set';
      }

      row.appendChild(nameEl);
      row.appendChild(valueEl);
      container.appendChild(row);
    }
  }

  function renderConsentIssues(issues) {
    var container = document.getElementById('consentIssues');
    container.innerHTML = '';

    if (issues.length === 0) {
      var ok = document.createElement('div');
      ok.className = 'consent-issue-item issue-ok';
      ok.textContent = t('consent_no_issues');
      container.appendChild(ok);
      return;
    }

    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var item = document.createElement('div');
      item.className = 'consent-issue-item issue-' + issue.severity;

      var icon = document.createElement('span');
      icon.className = 'consent-issue-icon';
      icon.textContent = issue.severity === 'error' ? '\u2716' : '\u26A0';

      var msg = document.createElement('span');
      msg.className = 'consent-issue-message';
      msg.textContent = issue.message;

      item.appendChild(icon);
      item.appendChild(msg);
      container.appendChild(item);
    }
  }

  function renderConsentTimeline(timeline) {
    var container = document.getElementById('consentTimeline');
    container.innerHTML = '';

    if (timeline.length === 0) return;

    var title = document.createElement('div');
    title.className = 'consent-timeline-title';
    title.textContent = t('consent_timeline');
    container.appendChild(title);

    for (var i = 0; i < timeline.length; i++) {
      var entry = timeline[i];
      var item = document.createElement('div');
      item.className = 'consent-timeline-item';

      var dot = document.createElement('span');
      dot.className = 'consent-timeline-dot ' + (entry.type === 'default' ? 'dot-default' : 'dot-update');

      var typeEl = document.createElement('span');
      typeEl.className = 'consent-timeline-type';
      typeEl.textContent = 'consent.' + entry.type;

      var sourceEl = document.createElement('span');
      sourceEl.className = 'consent-timeline-source';
      sourceEl.textContent = entry.source;

      var timeEl = document.createElement('span');
      timeEl.className = 'consent-timeline-time';
      timeEl.textContent = formatTime(entry.timestamp);

      var paramsEl = document.createElement('div');
      paramsEl.className = 'consent-timeline-params';
      var paramKeys = Object.keys(entry.params);
      for (var p = 0; p < paramKeys.length; p++) {
        var tag = document.createElement('span');
        var val = entry.params[paramKeys[p]];
        tag.className = 'consent-param-tag ' + (val === 'granted' ? 'tag-granted' : 'tag-denied');
        tag.textContent = paramKeys[p] + ': ' + val;
        paramsEl.appendChild(tag);
      }

      item.appendChild(dot);
      item.appendChild(typeEl);
      item.appendChild(sourceEl);
      item.appendChild(timeEl);
      item.appendChild(paramsEl);
      container.appendChild(item);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AD LIBRARIES TAB
  // ═══════════════════════════════════════════════════════════

  function renderAdLibsTab() {
    var container = document.getElementById('adLibsContainer');
    container.innerHTML = '';

    if (!currentDomain) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>'
        + '<p class="empty-text">' + escapeHtml(t('adlibs_no_domain')) + '</p>';
      container.appendChild(empty);
      return;
    }

    // Domain indicator
    var domainBar = document.createElement('div');
    domainBar.className = 'adlibs-domain';
    domainBar.innerHTML = '<span>' + escapeHtml(t('adlibs_hint')) + '</span> <span class="adlibs-domain-name">' + escapeHtml(currentDomain) + '</span>';
    container.appendChild(domainBar);

    var libraries = [
      {
        name: t('adlibs_meta'),
        desc: t('adlibs_meta_desc'),
        color: '#0081FB',
        icon: 'f',
        url: 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=' + encodeURIComponent(currentDomain)
      },
      {
        name: t('adlibs_google'),
        desc: t('adlibs_google_desc'),
        color: '#4285F4',
        icon: 'G',
        url: 'https://adstransparency.google.com/?domain=' + encodeURIComponent(currentDomain)
      },
      {
        name: t('adlibs_linkedin'),
        desc: t('adlibs_linkedin_desc'),
        color: '#0A66C2',
        icon: 'in',
        url: 'https://www.linkedin.com/ad-library/'
      },
      {
        name: t('adlibs_tiktok'),
        desc: t('adlibs_tiktok_desc'),
        color: '#000000',
        icon: 'TT',
        url: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en'
      }
    ];

    var extIcon = window.IMPULSION_ICONS ? window.IMPULSION_ICONS.external : '';

    for (var i = 0; i < libraries.length; i++) {
      var lib = libraries[i];
      var card = document.createElement('a');
      card.className = 'adlib-card';
      card.href = lib.url;
      card.target = '_blank';
      card.rel = 'noopener';

      var iconEl = document.createElement('div');
      iconEl.className = 'adlib-icon';
      iconEl.style.backgroundColor = lib.color;
      if (lib.color === '#000000') {
        iconEl.style.backgroundColor = '#1A1A1A';
        iconEl.style.border = '1px solid #333';
      }
      iconEl.textContent = lib.icon;

      var infoEl = document.createElement('div');
      infoEl.className = 'adlib-info';
      var nameEl = document.createElement('div');
      nameEl.className = 'adlib-name';
      nameEl.textContent = lib.name;
      var descEl = document.createElement('div');
      descEl.className = 'adlib-desc';
      descEl.textContent = lib.desc;
      infoEl.appendChild(nameEl);
      infoEl.appendChild(descEl);

      var arrowEl = document.createElement('span');
      arrowEl.className = 'adlib-arrow';
      arrowEl.innerHTML = extIcon;

      card.appendChild(iconEl);
      card.appendChild(infoEl);
      card.appendChild(arrowEl);
      container.appendChild(card);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STACK TAB
  // ═══════════════════════════════════════════════════════════

  var STACK_CATEGORY_ORDER = ['cms', 'js_framework', 'css_framework', 'cdn', 'tool'];
  var STACK_CATEGORY_KEYS = {
    cms: 'stack_category_cms',
    js_framework: 'stack_category_js',
    css_framework: 'stack_category_css',
    cdn: 'stack_category_cdn',
    tool: 'stack_category_tools'
  };

  function renderStackTab(techstack) {
    var container = document.getElementById('stackContainer');
    var emptyState = document.getElementById('stackEmptyState');

    // Remove existing category elements
    var existing = container.querySelectorAll('.stack-category');
    for (var r = 0; r < existing.length; r++) existing[r].remove();

    if (!techstack || techstack.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Group by category
    var groups = {};
    for (var i = 0; i < techstack.length; i++) {
      var tech = techstack[i];
      var cat = tech.category || 'tool';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tech);
    }

    for (var c = 0; c < STACK_CATEGORY_ORDER.length; c++) {
      var catKey = STACK_CATEGORY_ORDER[c];
      var items = groups[catKey];
      if (!items || items.length === 0) continue;

      var catEl = document.createElement('div');
      catEl.className = 'stack-category';

      var titleEl = document.createElement('div');
      titleEl.className = 'stack-category-title';
      titleEl.textContent = t(STACK_CATEGORY_KEYS[catKey]);
      catEl.appendChild(titleEl);

      for (var j = 0; j < items.length; j++) {
        catEl.appendChild(createStackItem(items[j]));
      }

      container.appendChild(catEl);
    }
  }

  function createStackItem(tech) {
    var item = document.createElement('div');
    item.className = 'stack-item';

    var iconEl = document.createElement('div');
    iconEl.className = 'stack-item-icon';
    iconEl.style.backgroundColor = tech.color || '#6366F1';
    if (tech.color === '#000000') {
      iconEl.style.backgroundColor = '#1A1A1A';
      iconEl.style.border = '1px solid #333';
    }
    iconEl.textContent = tech.icon || tech.name.charAt(0);

    var infoEl = document.createElement('div');
    infoEl.className = 'stack-item-info';

    var nameEl = document.createElement('span');
    nameEl.className = 'stack-item-name';
    nameEl.textContent = tech.name;

    infoEl.appendChild(nameEl);

    if (tech.version) {
      var versionEl = document.createElement('span');
      versionEl.className = 'stack-item-version';
      versionEl.textContent = ' v' + tech.version;
      infoEl.appendChild(versionEl);
    }

    var badgesEl = document.createElement('div');
    badgesEl.className = 'stack-item-badges';
    var sources = tech.detectedVia;
    if (typeof sources === 'string') sources = [sources];
    if (Array.isArray(sources)) {
      for (var i = 0; i < sources.length; i++) {
        var badge = document.createElement('span');
        badge.className = 'stack-detect-badge';
        badge.textContent = sources[i];
        badgesEl.appendChild(badge);
      }
    }

    item.appendChild(iconEl);
    item.appendChild(infoEl);
    item.appendChild(badgesEl);

    return item;
  }

  // ═══════════════════════════════════════════════════════════
  // TOOLS TAB
  // ═══════════════════════════════════════════════════════════

  function renderToolsTab() {
    var container = document.getElementById('toolsContainer');
    container.innerHTML = '';

    var icons = window.IMPULSION_ICONS || {};

    // --- Eye Dropper Section ---
    var edSection = document.createElement('div');
    edSection.className = 'tool-section';

    var edHeader = document.createElement('div');
    edHeader.className = 'tool-section-header';
    edHeader.innerHTML = icons.eyedropper || '';
    var edTitle = document.createElement('span');
    edTitle.className = 'tool-section-title';
    edTitle.textContent = t('tools_eyedropper');
    edHeader.appendChild(edTitle);
    edSection.appendChild(edHeader);

    var edBtn = document.createElement('button');
    edBtn.className = 'tool-action-btn';
    edBtn.textContent = t('tools_eyedropper_btn');
    edBtn.addEventListener('click', handleEyeDropper);
    edSection.appendChild(edBtn);

    var edHint = document.createElement('div');
    edHint.className = 'tool-hint';
    edHint.textContent = t('tools_eyedropper_hint');
    edSection.appendChild(edHint);

    // Color result area (filled dynamically)
    var edResultArea = document.createElement('div');
    edResultArea.id = 'colorResultArea';
    edSection.appendChild(edResultArea);

    container.appendChild(edSection);

    // Load color history
    renderColorHistory();

    // --- Divider ---
    var div1 = document.createElement('div');
    div1.className = 'tool-divider';
    container.appendChild(div1);

    // --- Font Inspector Section ---
    var fiSection = document.createElement('div');
    fiSection.className = 'tool-section';

    var fiHeader = document.createElement('div');
    fiHeader.className = 'tool-section-header';
    fiHeader.innerHTML = icons.font || '';
    var fiTitle = document.createElement('span');
    fiTitle.className = 'tool-section-title';
    fiTitle.textContent = t('tools_font');
    fiHeader.appendChild(fiTitle);
    fiSection.appendChild(fiHeader);

    var fiBtn = document.createElement('button');
    fiBtn.className = 'tool-action-btn' + (fontInspectorActive ? ' active' : '');
    fiBtn.textContent = fontInspectorActive ? t('tools_font_btn_off') : t('tools_font_btn_on');
    fiBtn.addEventListener('click', handleFontInspector);
    fiSection.appendChild(fiBtn);

    var fiHint = document.createElement('div');
    fiHint.className = 'tool-hint';
    fiHint.textContent = t('tools_font_hint');
    fiSection.appendChild(fiHint);

    container.appendChild(fiSection);

    // --- Divider ---
    var div2 = document.createElement('div');
    div2.className = 'tool-divider';
    container.appendChild(div2);

    // --- Clear Data Section ---
    var clSection = document.createElement('div');
    clSection.className = 'tool-section';

    var clHeader = document.createElement('div');
    clHeader.className = 'tool-section-header';
    clHeader.innerHTML = icons.trash || '';
    var clTitle = document.createElement('span');
    clTitle.className = 'tool-section-title';
    clTitle.textContent = t('tools_clear');
    clHeader.appendChild(clTitle);
    clSection.appendChild(clHeader);

    // Cookie count
    var clInfo = document.createElement('div');
    clInfo.className = 'clear-info';
    var clLabel = document.createElement('span');
    clLabel.className = 'clear-info-label';
    clLabel.textContent = t('tools_cookies');
    var clCount = document.createElement('span');
    clCount.className = 'clear-info-count';
    clCount.id = 'cookieCount';
    clCount.textContent = '...';
    clInfo.appendChild(clLabel);
    clInfo.appendChild(clCount);
    clSection.appendChild(clInfo);

    // Buttons
    var clBtns = document.createElement('div');
    clBtns.className = 'clear-buttons';

    var clearCookiesBtn = document.createElement('button');
    clearCookiesBtn.className = 'clear-btn';
    clearCookiesBtn.id = 'clearCookiesBtn';
    clearCookiesBtn.textContent = t('tools_clear_cookies');
    clearCookiesBtn.addEventListener('click', handleClearCookies);

    var clearCacheBtn = document.createElement('button');
    clearCacheBtn.className = 'clear-btn';
    clearCacheBtn.id = 'clearCacheBtn';
    clearCacheBtn.textContent = t('tools_clear_cache');
    clearCacheBtn.addEventListener('click', handleClearCache);

    clBtns.appendChild(clearCookiesBtn);
    clBtns.appendChild(clearCacheBtn);
    clSection.appendChild(clBtns);

    container.appendChild(clSection);

    // Load cookie count
    loadCookieCount();
  }

  // --- Eye Dropper ---
  function handleEyeDropper() {
    if (!currentTabId) return;

    chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: function() {
        return new EyeDropper().open().then(function(result) {
          chrome.storage.local.get('colorHistory', function(data) {
            var history = data.colorHistory || [];
            history.unshift(result.sRGBHex);
            if (history.length > 10) history = history.slice(0, 10);
            chrome.storage.local.set({ colorHistory: history, lastColor: result.sRGBHex });
          });
          return result.sRGBHex;
        });
      }
    }).then(function(results) {
      if (results && results[0] && results[0].result) {
        renderColorResult(results[0].result);
        renderColorHistory();
      }
    }).catch(function() {
      // User cancelled or API not available
    });
  }

  function renderColorResult(hex) {
    var area = document.getElementById('colorResultArea');
    if (!area) return;
    area.innerHTML = '';

    var result = document.createElement('div');
    result.className = 'color-result';

    var swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = hex;

    var values = document.createElement('div');
    values.className = 'color-values';

    var rgb = hexToRgb(hex);
    var hsl = hexToHsl(hex);

    var rows = [
      { label: t('tools_color_hex'), value: hex },
      { label: t('tools_color_rgb'), value: 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')' },
      { label: t('tools_color_hsl'), value: 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)' }
    ];

    for (var i = 0; i < rows.length; i++) {
      var row = document.createElement('div');
      row.className = 'color-value-row';
      row.setAttribute('data-copy', rows[i].value);
      row.addEventListener('click', function() {
        navigator.clipboard.writeText(this.getAttribute('data-copy'));
        showToast(this, t('tools_copy'));
      });

      var labelEl = document.createElement('span');
      labelEl.className = 'color-value-label';
      labelEl.textContent = rows[i].label;

      var valueEl = document.createElement('span');
      valueEl.className = 'color-value-text';
      valueEl.textContent = rows[i].value;

      row.appendChild(labelEl);
      row.appendChild(valueEl);
      values.appendChild(row);
    }

    result.appendChild(swatch);
    result.appendChild(values);
    area.appendChild(result);
  }

  function renderColorHistory() {
    chrome.storage.local.get('colorHistory', function(data) {
      var history = data.colorHistory || [];
      if (history.length === 0) return;

      var area = document.getElementById('colorResultArea');
      if (!area) return;

      // Remove existing history
      var existing = area.querySelector('.color-history');
      if (existing) existing.remove();

      var historyEl = document.createElement('div');
      historyEl.className = 'color-history';

      var titleEl = document.createElement('div');
      titleEl.className = 'color-history-title';
      titleEl.textContent = t('tools_color_history');
      historyEl.appendChild(titleEl);

      var rowEl = document.createElement('div');
      rowEl.className = 'color-history-row';

      for (var i = 0; i < history.length; i++) {
        var swatch = document.createElement('div');
        swatch.className = 'color-history-swatch';
        swatch.style.backgroundColor = history[i];
        swatch.title = history[i];
        swatch.setAttribute('data-hex', history[i]);
        swatch.addEventListener('click', function() {
          renderColorResult(this.getAttribute('data-hex'));
          navigator.clipboard.writeText(this.getAttribute('data-hex'));
        });
        rowEl.appendChild(swatch);
      }

      historyEl.appendChild(rowEl);
      area.appendChild(historyEl);
    });
  }

  // --- Font Inspector ---
  function handleFontInspector() {
    if (!currentTabId) return;

    fontInspectorActive = !fontInspectorActive;
    chrome.storage.session.set({ fontInspectorActive: fontInspectorActive });

    chrome.tabs.sendMessage(currentTabId, {
      type: fontInspectorActive ? 'font_inspector_on' : 'font_inspector_off'
    });

    // Re-render tools tab to update button state
    renderToolsTab();
  }

  // --- Clear Cookies/Cache ---
  function loadCookieCount() {
    if (!currentDomain) {
      var el = document.getElementById('cookieCount');
      if (el) el.textContent = '0';
      return;
    }
    chrome.cookies.getAll({ domain: currentDomain }, function(cookies) {
      var el = document.getElementById('cookieCount');
      if (el) el.textContent = cookies ? cookies.length : 0;
    });
  }

  function handleClearCookies() {
    if (!currentDomain) return;
    var btn = document.getElementById('clearCookiesBtn');

    chrome.cookies.getAll({ domain: currentDomain }, function(cookies) {
      if (!cookies) return;
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i];
        var protocol = c.secure ? 'https' : 'http';
        var url = protocol + '://' + c.domain.replace(/^\./, '') + c.path;
        chrome.cookies.remove({ url: url, name: c.name });
      }
      loadCookieCount();
      if (btn) {
        btn.classList.add('success');
        btn.textContent = t('tools_cleared');
        setTimeout(function() {
          btn.classList.remove('success');
          btn.textContent = t('tools_clear_cookies');
        }, 1500);
      }
    });
  }

  function handleClearCache() {
    if (!currentOrigin) return;
    var btn = document.getElementById('clearCacheBtn');

    chrome.browsingData.remove(
      { origins: [currentOrigin] },
      { cache: true },
      function() {
        if (btn) {
          btn.classList.add('success');
          btn.textContent = t('tools_cleared');
          setTimeout(function() {
            btn.classList.remove('success');
            btn.textContent = t('tools_clear_cache');
          }, 1500);
        }
      }
    );
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  function extractEventName(evt) {
    var args = evt.args;
    if (!args) return evt.fn || 'Unknown';

    if (evt.fn === 'network_request') {
      if (args && args.url) {
        try {
          var url = new URL(args.url);
          var path = url.pathname.split('/').pop();
          return path || url.hostname;
        } catch (e) {
          return 'request';
        }
      }
      return 'network';
    }

    if (Array.isArray(args)) {
      if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
        return args[0] + ': ' + args[1];
      }
      if (args.length >= 1 && typeof args[0] === 'string') {
        return args[0];
      }
      if (args.length >= 1 && typeof args[0] === 'object' && args[0] !== null) {
        if (args[0].event) return args[0].event;
        var keys = Object.keys(args[0]);
        if (keys.length > 0) return keys[0];
      }
    }

    return evt.fn || 'event';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function formatDetectionSource(source) {
    if (!source) return '';
    return source
      .replace('global:', '')
      .replace('dom:', '')
      .replace('event_args', 'args')
      .replace('script_src', 'script')
      .replace('network', 'network')
      .replace('inline', 'inline')
      .replace('noscript', 'noscript');
  }

  function syntaxHighlight(obj) {
    var json;
    try {
      json = JSON.stringify(obj, null, 2);
    } catch (e) {
      return escapeHtml(String(obj));
    }

    if (!json) return 'null';

    return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"([^"]+)"(?=\s*:)/g, '<span class="json-key">"$1"</span>')
      .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function hexToHsl(hex) {
    var rgb = hexToRgb(hex);
    var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function showToast(el, text) {
    var toast = document.createElement('span');
    toast.style.cssText = 'font-size:9px;color:#22C55E;margin-left:6px;font-weight:600';
    toast.textContent = text;
    el.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 1200);
  }

  // ─── Start ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
