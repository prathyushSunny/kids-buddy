import { useState, useRef, useCallback } from 'react';

const getSR = () =>
  (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

/**
 * iPhone-style speech-to-text hook.
 *
 * Usage:
 *   const { isListening, supported, toggle, onPointerUp } = useSpeechInput({ taRef, onChange });
 *
 * - taRef:     React ref attached to the <textarea>
 * - onChange:  called with the full new string on every interim/final result
 * - onPointerUp: attach to the textarea's onPointerUp (re-anchors insertion point on tap/click)
 */
export default function useSpeechInput({ taRef, onChange }) {
  const [isListening, setIsListening] = useState(false);

  const keepRef   = useRef(false); // true while user wants mic on
  const baseRef   = useRef('');    // text before insertion point / before selection
  const tailRef   = useRef('');    // text after insertion point / after selection
  const rRef      = useRef(null);  // current SpeechRecognition instance

  // "Latest ref" pattern — always holds the most recent applyText without stale closure
  const applyRef  = useRef(null);
  applyRef.current = (base, interim, tail) => {
    onChange(base + interim + tail);
    // Restore cursor to end of committed + interim text
    const pos = base.length + interim.length;
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.selectionStart = pos;
      el.selectionEnd   = pos;
    });
  };

  // Snapshot textarea cursor / selection → sets base + tail
  const captureAnchor = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    baseRef.current = el.value.slice(0, el.selectionStart);
    tailRef.current = el.value.slice(el.selectionEnd);
  }, [taRef]);

  // "Latest ref" for the session launcher (avoids stale closure in onend)
  const launchRef = useRef(null);
  launchRef.current = () => {
    const SR = getSR();
    if (!SR || !keepRef.current) return;

    const r = new SR();
    rRef.current = r;
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = 'en-IN';

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          baseRef.current += t;
        } else {
          interim = t;
        }
      }
      applyRef.current(baseRef.current, interim, tailRef.current);
    };

    r.onerror = (ev) => {
      // 'no-speech' and 'aborted' are expected; don't kill session on them
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      keepRef.current = false;
      setIsListening(false);
    };

    r.onend = () => {
      if (keepRef.current) {
        // Before restarting, commit whatever the textarea currently shows as the new base.
        // Fixes iOS auto-stopping without firing a final onresult — without this, baseRef
        // stays at the pre-speech position and the restarted session's interim text replaces
        // what was already showing instead of appending to it.
        const el = taRef.current;
        if (el && el.value !== baseRef.current + tailRef.current) {
          // Interim text was on screen but never finalized; commit it now.
          baseRef.current = el.value;
          tailRef.current = '';
        }
        setTimeout(() => { launchRef.current?.(); }, 80);
      } else {
        setIsListening(false);
      }
    };

    try { r.start(); } catch { /* already started */ }
  };

  const start = useCallback(() => {
    if (!getSR()) return;
    captureAnchor();
    keepRef.current = true;
    setIsListening(true);
    launchRef.current?.();
  }, [captureAnchor]);

  const stop = useCallback(() => {
    keepRef.current = false;
    try { rRef.current?.stop(); } catch {}
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop(); else start();
  }, [isListening, start, stop]);

  // Re-anchor when user taps/clicks textarea while mic is live.
  // This enables selection-replacement: select "some text", then speak → replaces it.
  const onPointerUp = useCallback(() => {
    if (isListening) captureAnchor();
  }, [isListening, captureAnchor]);

  return {
    isListening,
    supported: !!getSR(),
    toggle,
    stop,
    onPointerUp,
    reanchor: captureAnchor, // call from onKeyUp so keyboard cursor moves are respected
  };
}
