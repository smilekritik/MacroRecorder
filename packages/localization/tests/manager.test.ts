import { describe, it, expect, beforeEach } from 'vitest';
import { LocalizationManager, localizationManager, t, format } from '../src/index.js';

describe('LocalizationManager', () => {
  beforeEach(() => {
    localizationManager.setLanguage('en');
  });

  it('implements English identity localization as default', () => {
    expect(localizationManager.currentLanguage).toBe('en');
    expect(localizationManager.currentLocale).toBe('en-US');

    // English source strings return identity
    expect(t('Gamepad')).toBe('Gamepad');
    expect(t('waiting for input…')).toBe('waiting for input…');
    expect(format('Slot {0}', 1)).toBe('Slot 1');
  });

  it('translates into Russian when language is set to ru', () => {
    localizationManager.setLanguage('ru');
    expect(localizationManager.currentLanguage).toBe('ru');
    expect(localizationManager.currentLocale).toBe('ru-RU');

    expect(t('Gamepad')).toBe('Геймпад');
    expect(t('waiting for input…')).toBe('ждём ввод…');
    expect(format('Slot {0}', 2)).toBe('Слот 2');
  });

  it('falls back to identity for untranslated strings in Russian', () => {
    localizationManager.setLanguage('ru');
    expect(t('NonExistentKey12345')).toBe('NonExistentKey12345');
    expect(format('NonExistentKey {0}', 'val')).toBe('NonExistentKey val');
  });

  it('notifies subscribers on language change', () => {
    const changes: string[] = [];
    const unsubscribe = localizationManager.subscribe((lang) => {
      changes.push(lang);
    });

    localizationManager.setLanguage('ru');
    localizationManager.setLanguage('en');

    expect(changes).toEqual(['ru', 'en']);

    unsubscribe();
    localizationManager.setLanguage('ru');
    // No new calls after unsubscribe
    expect(changes).toEqual(['ru', 'en']);
  });

  it('supports explicit target language in translate', () => {
    localizationManager.setLanguage('en');

    expect(localizationManager.translate('Gamepad', 'ru')).toBe('Геймпад');
    expect(localizationManager.translate('Gamepad', 'en')).toBe('Gamepad');
  });

  it('hasTranslation checks presence in catalog', () => {
    expect(localizationManager.hasTranslation('Gamepad', 'ru')).toBe(true);
    expect(localizationManager.hasTranslation('Gamepad', 'en')).toBe(true);
    expect(localizationManager.hasTranslation('RandomUnknownString', 'ru')).toBe(false);
  });

  it('creates independent manager instances', () => {
    const custom = new LocalizationManager('ru');
    expect(custom.currentLanguage).toBe('ru');
    expect(custom.translate('Gamepad')).toBe('Геймпад');

    custom.setLanguage('en');
    expect(custom.currentLanguage).toBe('en');
    expect(custom.translate('Gamepad')).toBe('Gamepad');
  });
});
