import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export async function openLivePage(url, dependencies = {}) {
  if (!url) return false;
  const isNativePlatform = dependencies.isNativePlatform || (() => Capacitor.isNativePlatform());
  const browserOpen = dependencies.browserOpen || ((options) => Browser.open(options));
  const windowOpen = dependencies.windowOpen || ((...args) => window.open(...args));

  if (isNativePlatform()) {
    await browserOpen({ url, presentationStyle: 'popover' });
  } else {
    windowOpen(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}
