import React, { useState, useRef, useEffect } from 'react';
import { MAPS_API_KEY } from '../../constants';

const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete';

export default function PlaceSearch({ value, onChange, onSelect, placeholder }) {
  const [query,   setQuery]   = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const timer   = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = async (q) => {
    if (!MAPS_API_KEY || q.length < 2) { setResults([]); setOpen(false); return; }
    try {
      const res = await fetch(PLACES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': MAPS_API_KEY,
          'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat,suggestions.placePrediction.placeId',
        },
        body: JSON.stringify({
          input: q,
          includedRegionCodes: ['in'],
          locationBias: {
            circle: {
              center: { latitude: 17.385, longitude: 78.4867 }, // Hyderabad
              radius: 50000,
            },
          },
        }),
      });
      const data = await res.json();
      setResults((data.suggestions || []).slice(0, 6));
      setOpen(true);
    } catch { setResults([]); }
  };

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 350);
  };

  const handleSelect = (suggestion) => {
    const sf      = suggestion.placePrediction?.structuredFormat;
    const placeId = suggestion.placePrediction?.placeId || '';
    const main    = sf?.mainText?.text || '';
    const sec     = sf?.secondaryText?.text || '';
    const full    = sec ? `${main}, ${sec}` : main;
    setQuery(full);
    onChange(full);
    if (onSelect) onSelect(full, placeId);
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="place-search-wrap">
      <input
        className="modal-input"
        type="text"
        placeholder={placeholder || 'Search location…'}
        value={query}
        onChange={handleChange}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="place-drop">
          {results.map((s, i) => {
            const sf = s.placePrediction?.structuredFormat;
            return (
              <button
                key={i}
                className="place-item"
                type="button"
                onMouseDown={() => handleSelect(s)}
              >
                <span className="place-main">{sf?.mainText?.text}</span>
                {sf?.secondaryText?.text && (
                  <span className="place-sub">{sf.secondaryText.text}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
