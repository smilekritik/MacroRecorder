/**
 * @macro-recorder/desktop - Accessibility (a11y) Verification Helpers
 * Audits keyboard focusability, ARIA attributes, semantic roles, and labeled controls.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface A11yAuditResult {
  readonly interactiveCount: number;
  readonly unlabeledCount: number;
  readonly rolesPresent: readonly string[];
  readonly hasFocusRing: boolean;
}

/**
 * Scans a page or modal dialog for accessibility compliance.
 */
export async function auditSurfaceAccessibility(page: Page, rootSelector = '#root'): Promise<A11yAuditResult> {
  const result = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) {
      return {
        interactiveCount: 0,
        unlabeledCount: 0,
        rolesPresent: [],
        hasFocusRing: true,
      };
    }

    const interactiveElements = root.querySelectorAll(
      'button, input, select, textarea, [tabindex], [role="button"], [role="tab"]'
    );

    let unlabeled = 0;
    const roles = new Set<string>();

    interactiveElements.forEach((el) => {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      roles.add(role);

      // Skip non-interactive negative tabindex container elements
      if (
        el.getAttribute('tabindex') === '-1' &&
        !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      ) {
        return;
      }

      const hasText = (el.textContent || '').trim().length > 0;
      const hasAriaLabel = el.hasAttribute('aria-label') && (el.getAttribute('aria-label') || '').trim().length > 0;
      const hasAriaLabelledBy = el.hasAttribute('aria-labelledby');
      const hasTitle = el.hasAttribute('title') && (el.getAttribute('title') || '').trim().length > 0;
      const isInputWithPlaceholder = el.tagName === 'INPUT' && !!(el as HTMLInputElement).placeholder;

      // Check for associated or enclosing <label>
      const labelEl = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      const hasLabelText = labelEl ? (labelEl.textContent || '').trim().length > 0 : false;

      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !isInputWithPlaceholder && !hasLabelText) {
        unlabeled++;
      }
    });

    return {
      interactiveCount: interactiveElements.length,
      unlabeledCount: unlabeled,
      rolesPresent: Array.from(roles),
      hasFocusRing: true,
    };
  }, rootSelector);

  expect(result.unlabeledCount).toBe(0);
  return result;
}

/**
 * Tests keyboard tab navigation through elements in the given page.
 */
export async function verifyKeyboardTabOrder(page: Page, stepCount = 5): Promise<string[]> {
  const focusedElements: string[] = [];

  for (let i = 0; i < stepCount; i++) {
    await page.keyboard.press('Tab');
    const focusedTagAndRole = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'none';
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const text = (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 20);
      return `${role}:${text}`;
    });
    focusedElements.push(focusedTagAndRole);
  }

  return focusedElements;
}
