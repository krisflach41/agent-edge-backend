// /api/appreciation-rate.js
// Returns FHFA appreciation rate for a given state code
// Uses same FRED data as buy-vs-rent.js and report-card.js

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

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

const ZIP_STATE = {
  '00':'PR','01':'MA','02':'MA','03':'NH','04':'ME','05':'VT','06':'CT','07':'NJ','08':'NJ',
  '10':'NY','11':'NY','12':'NY','13':'NY','14':'NY','15':'PA','16':'PA','17':'PA',
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

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var fredKey = process.env.FRED_API_KEY;
    if (!fredKey) return res.status(200).json({ rate: 3.5, source: 'default' });

    // Accept state code or zip
    var state = (req.query.state || '').toUpperCase();
    var zip = req.query.zip || '';

    if (!state && zip) {
      state = zipToState(zip);
    }

    if (!state || !FRED_STATE_SERIES[state]) {
      return res.status(200).json({ rate: 3.5, state: state || 'unknown', source: 'default' });
    }

    var seriesId = FRED_STATE_SERIES[state];
    var url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + fredKey + '&file_type=json&sort_order=desc&observation_start=2010-01-01';
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('FRED ' + resp.status);
    var data = await resp.json();
    var obs = data.observations || [];
    if (obs.length < 5) return res.status(200).json({ rate: 3.5, state: state, source: 'default' });

    var latest = parseFloat(obs[0].value);

    function calcRate(quartersBack) {
      if (obs.length <= quartersBack) return null;
      var prev = parseFloat(obs[quartersBack].value);
      if (!prev) return null;
      var years = quartersBack / 4;
      return Math.round((Math.pow(latest / prev, 1 / years) - 1) * 10000) / 100;
    }

    var rate1yr = calcRate(4);
    var rate5yr = calcRate(20);
    var rate10yr = calcRate(40);
    var forecastRate = rate5yr || rate1yr || 3.5;

    return res.status(200).json({
      rate: forecastRate,
      oneYear: rate1yr,
      fiveYear: rate5yr,
      tenYear: rate10yr,
      state: state,
      stateName: STATE_NAMES[state] || state,
      latestDate: obs[0].date,
      source: 'FHFA House Price Index via FRED'
    });
  } catch (err) {
    console.error('Appreciation rate error:', err);
    return res.status(200).json({ rate: 3.5, source: 'default', error: err.message });
  }
}
