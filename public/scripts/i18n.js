/**
 * i18n.js — Locale dictionary loader + language toggle logic
 *
 * Primary language: Arabic (RTL) — loaded by default, no user action needed.
 * Secondary language: English (LTR) — activated via language toggle in navbar.
 *
 * Usage:
 *   i18n.t('app_title')          → translated string
 *   i18n.t('pass_title', { name: 'علي' }) → interpolated string
 *   i18n.setLang('en')           → switch to English + flip body.LTR class
 *   i18n.setLang('ar')           → switch back to Arabic + remove body.LTR class
 */

const i18n = (() => {
  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  let _currentLang = 'ar';   // Arabic is the default (primary)
  let _dict = {};            // Active locale dictionary (loaded at init)

  // -------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------

  /**
   * Interpolate a template string with a data object.
   * Replaces {{key}} tokens with the corresponding value.
   *
   * @param {string} template  - e.g. "مرر الجهاز لـ {{name}}"
   * @param {object} [data={}] - e.g. { name: 'علي' }
   * @returns {string}
   */
  function _interpolate(template, data = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      data[key] !== undefined ? data[key] : `{{${key}}}`
    );
  }

  /**
   * Fetch a locale JSON file and return the parsed object.
   *
   * @param {string} lang - 'ar' or 'en'
   * @returns {Promise<object>}
   */
  async function _load(lang) {
    const resp = await fetch(`/locales/${lang}.json`);
    if (!resp.ok) throw new Error(`i18n: Failed to load /locales/${lang}.json (${resp.status})`);
    return resp.json();
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  /**
   * Translate a key from the active locale dictionary.
   *
   * @param {string} key      - Locale key (e.g. 'btn_play')
   * @param {object} [data]   - Optional interpolation data
   * @returns {string}        - Translated (and optionally interpolated) string
   */
  function t(key, data) {
    const raw = _dict[key];
    if (!raw) {
      console.warn(`i18n: missing key "${key}" for lang "${_currentLang}"`);
      return key;
    }
    return data ? _interpolate(raw, data) : raw;
  }

  /**
   * Get the current language code.
   * @returns {'ar'|'en'}
   */
  function getLang() {
    return _currentLang;
  }

  /**
   * Switch the active language and apply DOM changes.
   * - Sets body.LTR class for English; removes it for Arabic.
   * - Re-renders all elements with [data-i18n] attributes.
   * - Fires a 'langchange' CustomEvent on document.
   *
   * @param {'ar'|'en'} lang
   * @returns {Promise<void>}
   */
  async function setLang(lang) {
    if (lang === _currentLang) return;
    _dict = await _load(lang);
    _currentLang = lang;

    // Toggle LTR class — Arabic has no class (RTL is default)
    if (lang === 'en') {
      document.body.classList.add('LTR');
      document.documentElement.setAttribute('lang', 'en');
      document.documentElement.setAttribute('dir', 'ltr');
    } else {
      document.body.classList.remove('LTR');
      document.documentElement.setAttribute('lang', 'ar');
      document.documentElement.setAttribute('dir', 'rtl');
    }

    // Re-render all [data-i18n] elements
    _applyToDOM();

    // Notify other modules
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  /**
   * Apply translations to all elements with [data-i18n] attribute.
   * Elements may also carry [data-i18n-attr] to target a specific
   * attribute (e.g. placeholder, aria-label) instead of textContent.
   */
  function _applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key  = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const nParam = el.getAttribute('data-i18n-n');
      const dataKey = el.getAttribute('data-i18n-data-key');
      const dataVal = el.getAttribute('data-i18n-data-val');

      let data;
      if (nParam !== null) {
        data = { n: nParam };
      } else if (dataKey && dataVal !== null) {
        data = { [dataKey]: dataVal };
      }

      const text = t(key, data);
      if (attr) {
        el.setAttribute(attr, text);
      } else {
        el.textContent = text;
      }
    });
  }

  /**
   * Initialise the i18n module.
   * Loads the default Arabic locale and applies translations to the DOM.
   * Must be called once on DOMContentLoaded.
   *
   * @returns {Promise<void>}
   */
  async function init() {
    _dict = await _load('ar');  // Arabic is the primary/default locale
    _currentLang = 'ar';
    _applyToDOM();
  }

  // Expose public API
  return { t, getLang, setLang, init, applyToDOM: _applyToDOM };
})();

// Initialization is handled by app.js
