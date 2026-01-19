// utils.js - shared helpers for Lunacy
// Loaded BEFORE astro.js and app.js (see index.html)

function parseISO(s){ return new Date(s + "T00:00:00"); }

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}
