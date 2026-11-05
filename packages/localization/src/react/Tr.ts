import React from 'react';
import { useLocalization } from './use-localization.js';

export interface TrProps {
  readonly text: string;
  readonly args?: readonly unknown[];
  readonly className?: string;
  readonly as?: string;
}

/**
 * Tr renders a translated string as a React component.
 * It renders the translated string for the current language.
 */
export const Tr: React.FC<TrProps> = ({ text, args, className, as }) => {
  const { t, format } = useLocalization();

  const content = args && args.length > 0 ? format(text, ...args) : t(text);

  if (className || as) {
    const Tag = as || 'span';
    return React.createElement(Tag, { className }, content);
  }

  return React.createElement(React.Fragment, null, content);
};
