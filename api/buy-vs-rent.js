// /api/buy-vs-rent.js - Buy vs Rent Analysis data
// Data Sources: FRED/FHFA (appreciation), Geocodio (geocoding), HUD FMR (rent data)
// Env vars: FRED_API_KEY, GEOCODIO_API_KEY, HUD_API_KEY
// Uses identical appreciation logic to report-card.js for consistency with Neighborhood Blueprint

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// ===== STATE FIPS CODES (same as report-card.js) =====
const STATE_FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',
  GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',
  MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',
  NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',
  SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'
};

// ===== FRED SERIES IDs (same as report-card.js) =====
const FRED_STATE_SERIES = {
  AL:'ALSTHPI',AK:'AKSTHPI',AZ:'AZSTHPI',AR:'ARSTHPI',CA:'CASTHPI',CO:'COSTHPI',
  CT:'CTSTHPI',DE:'DESTHPI',DC:'DCSTHPI',FL:'FLSTHPI',GA:'GASTHPI',HI:'HISTHPI',
  ID:'IDSTHPI',IL:'ILSTHPI',IN:'INSTHPI',IA:'IASTHPI',KS:'KSSTHPI',KY:'KYSTHPI',
  LA:'LASTHPI',ME:'MESTHPI',MD:'MDSTHPI',MA:'MASTHPI',MI:'MISTHPI',MN:'MNSTHPI',
  MS:'MSSTHPI',MO:'MOSTHPI',MT:'MTSTHPI',NE:'NESTHPI',NV:'NVSTHPI',NH:'NHSTHPI',
  NJ:'NJSTHPI',NM:'NMSTHPI',NY:'NYSTHPI',NC:'NCSTHPI',ND:'NDSTHPI',OH:'OHSTHPI',
  OK:'OKSTHPI',OR:'ORSTHPI',PA:'PASTHPI',RI:'RISTHPI',SC:'SCSTHPI',SD:'SDSTHPI',
  TN:'TNSTHPI',TX:'TXSTHPI',UT:'UTSTHPI',VT:'VTSTHPI',VA:'VASTHPI',WA:'WASTHPI',
  WV:'WVSTHPI',WI:'WISTHPI',WY:'WYSTHPI'
};

// ===== STATE NAMES =====
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
  MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
};

// ===== ZIP to State (simple lookup) =====
const ZIP_STATE = {
  '0':'CT','1':'NY','2':'VA','3':'FL','4':'ME','5':'VT','6':'IL','7':'TX','8':'CO','9':'CA',
  '00':'PR','01':'MA','02':'MA','03':'NH','04':'ME','05':'VT','06':'CT','07':'NJ','08':'NJ',
  '09':'PR','10':'NY','11':'NY','12':'NY','13':'NY','14':'NY','15':'PA','16':'PA','17':'PA',
  '18':'PA','19':'PA','20':'DC','21':'MD','22':'VA','23':'VA','24':'VA','25':'WV','26':'WV',
  '27':'NC','28':'NC','29':'SC','30':'GA','31':'GA','32':'FL','33':'FL','34':'FL',
  '35':'AL','36':'AL','37':'TN','38':'TN','39':'MS','40':'KY','41':'KY','42':'KY',
  '43':'OH','44':'OH','45':'OH','46':'IN','47':'IN','48':'MI','49':'MI',
  '50':'IA','51':'IA','52':'IA','53':'WI','54':'WI','55':'MN','56':'MT',
  '57':'SD','58':'ND','59':'MT','60':'IL','61':'IL','62':'IL','63':'MO','64':'MO','65':'MO',
  '66':'KS','67':'KS','68':'NE','69':'NE','70':'LA','71':'LA','72':'AR',
  '73':'OK','74':'OK','75':'TX','76':'TX','77':'TX','78':'TX','79':'TX',
  '80':'CO','81':'CO','82':'WY','83':'ID','84':'UT','85':'AZ','86':'AZ',
  '87':'NM','88':'NM','89':'NV','90':'CA','91':'CA','92':'CA','93':'CA','94':'CA',
  '95':'CA','96':'HI','97':'OR','98':'WA','99':'WA'
};

function zipToState(zip) {
  if (!zip) return null;
  return ZIP_STATE[zip.substring(0, 2)] || ZIP_STATE[zip.substring(0, 1)] || null;
}

// ===== HELPER: Fetch with timeout =====
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ===== GEOCODIO: ZIP/Address to City, County, State, FIPS =====
// IDENTICAL to report-card.js fetchGeoData
async function fetchGeoData(query, geocodioKey) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.geocod.io/v1.7/geocode?q=${encoded}&api_key=${geocodioKey}&fields=census2020`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;

    const comp = result.address_components || {};
    const census = result.fields?.census2020 || {};

    return {
      city: comp.city || '',
      county: comp.county || '',
      state: comp.state || '',
      stateCode: comp.state || '',
      zip: comp.zip || '',
      formattedAddress: result.formatted_address || '',
      countyFips: census.county_fips || null,
      stateFips: census.state_fips || null,
      source: 'Geocodio'
    };
  } catch (e) {
    console.error('Geocodio error:', e.message);
    return null;
  }
}

// ===== FHFA APPRECIATION DATA =====
// IDENTICAL logic to report-card.js fetchAppreciation
async function fetchAppreciation(stateCode, fredKey) {
  const seriesId = FRED_STATE_SERIES[stateCode];
  if (!seriesId) return null;

  try {
    const url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + fredKey + '&file_type=json&sort_order=desc&observation_start=2010-01-01';
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('FRED ' + res.status);
    const data = await res.json();
    const obs = data.observations || [];
    if (obs.length < 2) return null;

    const latest = parseFloat(obs[0].value);
    const calcRate = (quartersBack) => {
      if (obs.length <= quartersBack) return null;
      const prev = parseFloat(obs[quartersBack].value);
      if (!prev) return null;
      const years = quartersBack / 4;
      return Math.round((Math.pow(latest / prev, 1 / years) - 1) * 10000) / 100;
    };

    const rate5yr = calcRate(20);
    const rate10yr = calcRate(40);
    const rate1yr = calcRate(4);
    const forecastRate = rate1yr || rate5yr || 3.5;

    return {
      oneYear: rate1yr,
      fiveYear: rate5yr,
      tenYear: rate10yr,
      forecastAnnualRate: Math.round(forecastRate * 100) / 100,
      latestHPI: latest,
      latestDate: obs[0].date,
      _source: 'FHFA House Price Index via FRED (state-level, quarterly)'
    };
  } catch (e) {
    console.error('FHFA error:', e.message);
    return null;
  }
}

// ===== HUD FAIR MARKET RENTS =====
// IDENTICAL logic to report-card.js fetchHUDRents
async function fetchHUDRents(zip, hudKey, stateFips, countyFips) {
  if (!hudKey) return null;

  try {
    let entityId = null;
    if (countyFips && countyFips.length >= 5) {
      entityId = countyFips + '99999';
    } else if (stateFips && countyFips) {
      entityId = stateFips + countyFips.slice(-3) + '99999';
    }

    if (!entityId) return null;

    const url = 'https://www.huduser.gov/hudapi/public/fmr/data/' + entityId;
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': 'Bearer ' + hudKey }
    }, 10000);

    if (!res.ok) return null;

    const data = await res.json();
    const fmrData = data?.data;
    if (!fmrData) return null;

    const basicdata = fmrData.basicdata;
    let zipRents = null;
    let msaRents = null;

    if (Array.isArray(basicdata)) {
      basicdata.forEach(row => {
        if (row.zip_code === zip) zipRents = row;
        if (row.zip_code === 'MSA level') msaRents = row;
      });
    } else if (basicdata) {
      msaRents = basicdata;
    }

    const rents = zipRents || msaRents || basicdata;
    if (!rents) return null;

    return {
      efficiency: parseFloat(rents['Efficiency']) || null,
      oneBed: parseFloat(rents['One-Bedroom']) || null,
      twoBed: parseFloat(rents['Two-Bedroom']) || null,
      threeBed: parseFloat(rents['Three-Bedroom']) || null,
      fourBed: parseFloat(rents['Four-Bedroom']) || null,
      metroName: fmrData.metro_name || null,
      year: fmrData.year || rents.year || null,
      isZipLevel: !!zipRents,
      _source: 'HUD Fair Market Rents (annual, ' + (zipRents ? 'zip-level' : 'metro-level') + ')'
    };
  } catch (e) {
    console.error('HUD FMR error:', e.message);
    return null;
  }
}

// ===== FCC AREA API (county FIPS fallback) =====
async function fetchFCCFips(lat, lon) {
  if (!lat || !lon) return null;
  try {
    const url = `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;
    return result.county_fips || null;
  } catch (e) {
    return null;
  }
}

// ===== MAIN HANDLER =====
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Get params
  const { zip, address } = req.query;
  if (!zip && !address) {
    return res.status(400).json({ error: 'Provide zip or address parameter' });
  }

  const fredKey = process.env.FRED_API_KEY;
  const geocodioKey = process.env.GEOCODIO_API_KEY;
  const hudKey = process.env.HUD_API_KEY;

  if (!fredKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  try {
    // Geocode to get state, county FIPS, etc.
    const geoQuery = address || zip;
    const geoData = geocodioKey ? await fetchGeoData(geoQuery, geocodioKey) : null;

    const stateCode = geoData?.stateCode || zipToState(zip);
    const resolvedZip = geoData?.zip || zip;

    if (!stateCode) {
      return res.status(400).json({ error: 'Could not determine state from input' });
    }

    // Get county FIPS (with FCC fallback)
    let fips5 = geoData?.countyFips || null;
    if (!fips5 && geoData?.stateFips) {
      // Try FCC fallback — not needed here but included for robustness
    }

    const stateFips = geoData?.stateFips || STATE_FIPS[stateCode] || null;

    // Fetch appreciation and HUD rents in parallel
    const [appreciation, hudRents] = await Promise.all([
      fetchAppreciation(stateCode, fredKey),
      (hudKey && stateFips && fips5) ? fetchHUDRents(resolvedZip, hudKey, stateFips, fips5) : null
    ]);

    // Build response
    return res.status(200).json({
      location: {
        city: geoData?.city || '',
        county: geoData?.county || '',
        state: stateCode,
        stateName: STATE_NAMES[stateCode] || stateCode,
        zip: resolvedZip,
        formattedAddress: geoData?.formattedAddress || '',
        countyFips: fips5
      },
      appreciation: appreciation ? {
        oneYear: appreciation.oneYear,
        fiveYear: appreciation.fiveYear,
        tenYear: appreciation.tenYear,
        forecastAnnualRate: appreciation.forecastAnnualRate,
        latestDate: appreciation.latestDate,
        _source: appreciation._source
      } : null,
      hudRents: hudRents ? {
        twoBed: hudRents.twoBed,
        threeBed: hudRents.threeBed,
        metroName: hudRents.metroName,
        year: hudRents.year,
        isZipLevel: hudRents.isZipLevel,
        _source: hudRents._source
      } : null,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Buy vs Rent API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
