// astro.js - optional "fun layer" for Lunacy
// Depends on utils.js (parseISO, addDays, clamp)

// ---------- astrology helpers (optional fun layer) ----------
const WESTERN_SIGNS = [
  { name:"Steinbock", start:[12,22], end:[1,19], adj:["zielstrebig","verlässlich","pragmatisch"], element:"earth" },
  { name:"Wassermann", start:[1,20], end:[2,18], adj:["unabhängig","originell","idealistisch"], element:"air" },
  { name:"Fische", start:[2,19], end:[3,20], adj:["einfühlsam","intuitiv","kreativ"], element:"water" },
  { name:"Widder", start:[3,21], end:[4,19], adj:["mutig","direkt","energiegeladen"], element:"fire" },
  { name:"Stier", start:[4,20], end:[5,20], adj:["genussvoll","stabil","geduldig"], element:"earth" },
  { name:"Zwillinge", start:[5,21], end:[6,20], adj:["neugierig","kommunikativ","vielseitig"], element:"air" },
  { name:"Krebs", start:[6,21], end:[7,22], adj:["fürsorglich","sensibel","loyal"], element:"water" },
  { name:"Löwe", start:[7,23], end:[8,22], adj:["warmherzig","stolz","kreativ"], element:"fire" },
  { name:"Jungfrau", start:[8,23], end:[9,22], adj:["analytisch","hilfsbereit","geordnet"], element:"earth" },
  { name:"Waage", start:[9,23], end:[10,22], adj:["harmonisch","diplomatisch","ästhetisch"], element:"air" },
  { name:"Skorpion", start:[10,23], end:[11,21], adj:["intensiv","treu","willensstark"], element:"water" },
  { name:"Schütze", start:[11,22], end:[12,21], adj:["optimistisch","freiheitsliebend","ehrlich"], element:"fire" },
];

// Chinese New Year dates (Gregorian). Used to decide which zodiac year a date belongs to.
// Source examples: Wikipedia / Royal Museums Greenwich list the same dates for these years.
const CHINESE_NEW_YEAR = {
  2019:"2019-02-05",
  2020:"2020-01-25",
  2021:"2021-02-12",
  2022:"2022-02-01",
  2023:"2023-01-22",
  2024:"2024-02-10",
  2025:"2025-01-29",
  2026:"2026-02-17",
  2027:"2027-02-06",
  2028:"2028-01-26",
  2029:"2029-02-13",
  2030:"2030-02-03",
  2031:"2031-01-23",
  2032:"2032-02-11",
  2033:"2033-01-31",
};

const CHINESE_ANIMALS = ["Ratte","Ochse","Tiger","Hase","Drache","Schlange","Pferd","Ziege","Affe","Hahn","Hund","Schwein"]; // Rat..Pig

function getWesternSign(date){
  const d = (typeof date === "string") ? parseISO(date) : date;
  const m = d.getMonth()+1;
  const day = d.getDate();

  // helper to check ranges that may wrap over year end
  const inRange = (mm,dd, sMM,sDD, eMM,eDD) => {
    const val = mm*100+dd;
    const start = sMM*100+sDD;
    const end = eMM*100+eDD;
    if (start <= end) return val >= start && val <= end;
    return (val >= start) || (val <= end);
  };

  for (const s of WESTERN_SIGNS){
    if (inRange(m, day, s.start[0], s.start[1], s.end[0], s.end[1])) return s;
  }
  return WESTERN_SIGNS[0];
}

function getChineseZodiac(date){
  const d = (typeof date === "string") ? parseISO(date) : date;
  let y = d.getFullYear();
  const cnyISO = CHINESE_NEW_YEAR[y];
  if (cnyISO){
    const cny = parseISO(cnyISO);
    if (d < cny) y = y - 1;
  } else {
    // fallback: approximate; works for most dates but can be off in Jan/Feb
    if (d.getMonth() < 1) y = y - 1;
  }

  const baseYear = 2020; // 2020 = Rat
  const idx = ((y - baseYear) % 12 + 12) % 12;
  return { year: y, animal: CHINESE_ANIMALS[idx] };
}

function astroCompatibilityGrade(childSignName, parentSignName){
  // Grade 1..6 (1 = best). Heuristic by elements.
  const child = WESTERN_SIGNS.find(s=>s.name===childSignName);
  const parent = WESTERN_SIGNS.find(s=>s.name===parentSignName);
  if (!child || !parent) return null;
  const ce = child.element;
  const pe = parent.element;

  if (ce === pe) return 1;
  const compatible = (a,b)=> (a==="fire"&&b==="air") || (a==="air"&&b==="fire") || (a==="earth"&&b==="water") || (a==="water"&&b==="earth");
  if (compatible(ce,pe)) return 2;

  // next-best: semi-compatible (fire-earth, air-water)
  const semi = (a,b)=> (a==="fire"&&b==="earth") || (a==="earth"&&b==="fire") || (a==="air"&&b==="water") || (a==="water"&&b==="air");
  if (semi(ce,pe)) return 3;

  // hardest: fire-water, earth-air
  const hard = (a,b)=> (a==="fire"&&b==="water") || (a==="water"&&b==="fire") || (a==="earth"&&b==="air") || (a==="air"&&b==="earth");
  if (hard(ce,pe)) return 5;
  return 4;
}

function combinedParentGrade(childSignName, motherSign, fatherSign){
  const gM = motherSign ? astroCompatibilityGrade(childSignName, motherSign) : null;
  const gF = fatherSign ? astroCompatibilityGrade(childSignName, fatherSign) : null;
  if (gM===null && gF===null) return { grade:null, detail:"" };
  if (gM!==null && gF!==null){
    const avg = Math.round((gM + gF) / 2);
    return { grade: clamp(avg,1,6), detail:`M${gM}/V${gF}` };
  }
  const single = (gM!==null)?gM:gF;
  const label = (gM!==null)?`M${gM}`:`V${gF}`;
  return { grade: clamp(single,1,6), detail: label };
}

function computeETFromOvulation(ovuDate){
  // ET ≈ Eisprung + 266 Tage (38 Wochen)
  return addDays(ovuDate, 266);
}

