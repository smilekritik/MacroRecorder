import { describe, it, expect } from 'vitest';
import {
  getGamepadButtonLegend,
  getGamepadAxisLegend,
  getVirtualKeyLegend,
  getMouseButtonKey,
  getMouseButtonName,
  isNonLinguisticLegend,
  localizationManager,
} from '../src/index.js';

describe('native key and gamepad legends', () => {
  describe('gamepad button legends', () => {
    it('returns exact pad legends', () => {
      expect(getGamepadButtonLegend('A')).toBe('A');
      expect(getGamepadButtonLegend('B')).toBe('B');
      expect(getGamepadButtonLegend('X')).toBe('X');
      expect(getGamepadButtonLegend('Y')).toBe('Y');
      expect(getGamepadButtonLegend('LeftBumper')).toBe('LB');
      expect(getGamepadButtonLegend('RightBumper')).toBe('RB');
      expect(getGamepadButtonLegend('Back')).toBe('Back');
      expect(getGamepadButtonLegend('Start')).toBe('Start');
      expect(getGamepadButtonLegend('Guide')).toBe('Guide');
      expect(getGamepadButtonLegend('LeftStick')).toBe('LS');
      expect(getGamepadButtonLegend('RightStick')).toBe('RS');
      expect(getGamepadButtonLegend('DPadUp')).toBe('D-Pad ↑');
      expect(getGamepadButtonLegend('DPadDown')).toBe('D-Pad ↓');
      expect(getGamepadButtonLegend('DPadLeft')).toBe('D-Pad ←');
      expect(getGamepadButtonLegend('DPadRight')).toBe('D-Pad →');
      expect(getGamepadButtonLegend('None')).toBe('—');
      expect(getGamepadButtonLegend('unknown')).toBe('—');
    });
  });

  describe('gamepad axis legends', () => {
    it('returns exact axis legends', () => {
      expect(getGamepadAxisLegend('LeftStickX')).toBe('LS X');
      expect(getGamepadAxisLegend('LeftStickY')).toBe('LS Y');
      expect(getGamepadAxisLegend('RightStickX')).toBe('RS X');
      expect(getGamepadAxisLegend('RightStickY')).toBe('RS Y');
      expect(getGamepadAxisLegend('LeftTrigger')).toBe('LT');
      expect(getGamepadAxisLegend('RightTrigger')).toBe('RT');
      expect(getGamepadAxisLegend('None')).toBe('—');
      expect(getGamepadAxisLegend('unknown')).toBe('—');
    });
  });

  describe('virtual key legends', () => {
    it('formats numbers and uppercase letters', () => {
      expect(getVirtualKeyLegend(0x30)).toBe('0');
      expect(getVirtualKeyLegend(0x39)).toBe('9');
      expect(getVirtualKeyLegend(0x41)).toBe('A');
      expect(getVirtualKeyLegend(0x5a)).toBe('Z');
    });

    it('formats function keys F1 to F24', () => {
      expect(getVirtualKeyLegend(0x70)).toBe('F1');
      expect(getVirtualKeyLegend(0x7b)).toBe('F12');
      expect(getVirtualKeyLegend(0x87)).toBe('F24');
    });

    it('formats numpad keys', () => {
      expect(getVirtualKeyLegend(0x60)).toBe('Num 0');
      expect(getVirtualKeyLegend(0x69)).toBe('Num 9');
      expect(getVirtualKeyLegend(0x6a)).toBe('Num *');
      expect(getVirtualKeyLegend(0x6b)).toBe('Num +');
      expect(getVirtualKeyLegend(0x6c)).toBe('Num Enter');
      expect(getVirtualKeyLegend(0x6d)).toBe('Num −');
      expect(getVirtualKeyLegend(0x6e)).toBe('Num .');
      expect(getVirtualKeyLegend(0x6f)).toBe('Num /');
    });

    it('formats modifier keys and navigation keys', () => {
      expect(getVirtualKeyLegend(0x08)).toBe('Backspace');
      expect(getVirtualKeyLegend(0x09)).toBe('Tab');
      expect(getVirtualKeyLegend(0x0d)).toBe('Enter');
      expect(getVirtualKeyLegend(0x1b)).toBe('Esc');
      expect(getVirtualKeyLegend(0x20)).toBe('Space');
      expect(getVirtualKeyLegend(0x10)).toBe('Shift');
      expect(getVirtualKeyLegend(0x11)).toBe('Ctrl');
      expect(getVirtualKeyLegend(0x12)).toBe('Alt');
      expect(getVirtualKeyLegend(0x25)).toBe('Left');
      expect(getVirtualKeyLegend(0x26)).toBe('Up');
      expect(getVirtualKeyLegend(0x27)).toBe('Right');
      expect(getVirtualKeyLegend(0x28)).toBe('Down');
      expect(getVirtualKeyLegend(0x5b)).toBe('Left Win');
      expect(getVirtualKeyLegend(0x5c)).toBe('Right Win');
      expect(getVirtualKeyLegend(0x5d)).toBe('Menu');
    });

    it('formats punctuation and special keys', () => {
      expect(getVirtualKeyLegend(0xc0)).toBe('`');
      expect(getVirtualKeyLegend(0xbd)).toBe('-');
      expect(getVirtualKeyLegend(0xbb)).toBe('=');
      expect(getVirtualKeyLegend(0xdb)).toBe('[');
      expect(getVirtualKeyLegend(0xdd)).toBe(']');
      expect(getVirtualKeyLegend(0xdc)).toBe('\\');
      expect(getVirtualKeyLegend(0xe2)).toBe('\\ (102)');
      expect(getVirtualKeyLegend(0xad)).toBe('Mute');
      expect(getVirtualKeyLegend(0xae)).toBe('Volume Down');
      expect(getVirtualKeyLegend(0xaf)).toBe('Volume Up');
      expect(getVirtualKeyLegend(0xb3)).toBe('Play / Pause');
    });

    it('formats unknown virtual keys as VK_XX hex', () => {
      expect(getVirtualKeyLegend(0x01)).toBe('VK_01');
      expect(getVirtualKeyLegend(0xff)).toBe('VK_FF');
    });
  });

  describe('mouse button localization', () => {
    it('maps mouse button to localized key', () => {
      expect(getMouseButtonKey('Left')).toBe('Left mouse button');
      expect(getMouseButtonKey('Right')).toBe('Right mouse button');
      expect(getMouseButtonKey('Middle')).toBe('Middle mouse button');
      expect(getMouseButtonKey('X1')).toBe('Extra mouse button X1');
      expect(getMouseButtonKey('X2')).toBe('Extra mouse button X2');
      expect(getMouseButtonKey('Unknown')).toBe('Mouse button');
    });

    it('translates mouse button name in English and Russian', () => {
      localizationManager.setLanguage('en');
      expect(getMouseButtonName('Left')).toBe('Left mouse button');
      expect(getMouseButtonName('Right')).toBe('Right mouse button');

      localizationManager.setLanguage('ru');
      expect(getMouseButtonName('Left')).toBe('Левая кнопка мыши');
      expect(getMouseButtonName('Right')).toBe('Правая кнопка мыши');
      expect(getMouseButtonName('Middle')).toBe('Средняя кнопка мыши');
      expect(getMouseButtonName('X1')).toBe('Дополнительная кнопка X1');
      expect(getMouseButtonName('X2')).toBe('Дополнительная кнопка X2');

      // Reset to default
      localizationManager.setLanguage('en');
    });
  });

  describe('isNonLinguisticLegend', () => {
    it('identifies hardware legends as non-linguistic', () => {
      expect(isNonLinguisticLegend('A')).toBe(true);
      expect(isNonLinguisticLegend('LB')).toBe(true);
      expect(isNonLinguisticLegend('D-Pad ↑')).toBe(true);
      expect(isNonLinguisticLegend('LS X')).toBe(true);
      expect(isNonLinguisticLegend('Backspace')).toBe(true);
      expect(isNonLinguisticLegend('F12')).toBe(true);
      expect(isNonLinguisticLegend('Num 5')).toBe(true);
      expect(isNonLinguisticLegend('VK_A5')).toBe(true);
      expect(isNonLinguisticLegend('—')).toBe(true);
      expect(isNonLinguisticLegend('{0}: {1}')).toBe(true);
    });

    it('identifies localized linguistic strings as needing localization', () => {
      expect(isNonLinguisticLegend('Start recording')).toBe(false);
      expect(isNonLinguisticLegend('Gamepad')).toBe(false);
      expect(isNonLinguisticLegend('Settings')).toBe(false);
      expect(isNonLinguisticLegend('Left mouse button')).toBe(false);
    });
  });
});
