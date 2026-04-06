// /api/knowledge-base.js — Shared knowledge base module
// Provides CMA expertise to AI content generation endpoints.
//
// Two sources:
//   1. Built-in sections from the CMA course (hardcoded below)
//   2. Custom entries Kristy adds via the admin panel (stored in Supabase)
//
// Usage:
//   const { getRelevantKnowledge } = require('./knowledge-base.js');
//   const kb = await getRelevantKnowledge('refinancing cost of waiting', process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
//   // kb is a string ready to inject into a system prompt

// ============================================================
// SECTION DEFINITIONS — each section has an id, keywords, and content
// Keywords are used for topic matching. Content is the actual text.
// ============================================================

const SECTIONS = [
  {
    id: 'mortgage_market',
    title: 'How the Mortgage Market Works',
    keywords: ['mortgage', 'market', 'lender', 'aggregator', 'mbs', 'mortgage backed securities', 'servicer', 'servicing', 'rate lock', 'hedge', 'hedging', 'origination', 'pipeline', 'secondary market', 'loan sale'],
    content: `HOW THE MORTGAGE MARKET WORKS
- The Mortgage Cycle: Borrower gets loan from lender → lender sells to aggregator → aggregator pools loans into Mortgage Backed Securities → MBS sold to investors → servicer collects payments and distributes to investors
- Interest Rate Risk: Lenders take on risk between origination and sale. They hedge by taking short positions in MBS
- Rate Locks: When a borrower locks a rate, the lender hedges that commitment by shorting MBS. If rates drop before closing, the lender's short position gains value, offsetting the below-market rate they're locked into
- Servicer Economics: Servicers pay ~1% upfront to acquire servicing rights, earn ~30 basis points annually from the servicing strip, and need roughly 3 years to break even
- COVID-Era Mortgage Crisis (March 2020): Massive rate drops caused servicing runoff, margin calls, and mark-to-market losses for servicers. The Fed's MBS purchases had unintended consequences for the servicing industry
- Fed Funds Rate vs Mortgage Rates: These are NOT the same thing. Fed Funds is an overnight rate; mortgage rates are long-term. They can move in opposite directions`
  },
  {
    id: 'rule_of_72',
    title: 'The Rule of 72',
    keywords: ['rule of 72', 'double', 'compound', 'compounding', 'interest rate math', 'investment growth', 'wealth building'],
    content: `THE RULE OF 72
- Quick way to estimate how long it takes money to double: divide 72 by the interest rate
- Example: at 6% interest, money doubles in ~12 years (72 ÷ 6 = 12)`
  },
  {
    id: 'amortization',
    title: 'Power of Amortization',
    keywords: ['amortization', 'amortize', 'prepayment', 'prepay', 'principal', 'biweekly', 'bi-weekly', 'extra payment', 'payoff', 'pay off', 'accelerate', 'loan term', 'equity building'],
    content: `POWER OF AMORTIZATION
- Lump sum prepayments dramatically reduce total interest and shorten the loan term
- Bi-weekly payments (26 half-payments per year = 13 full payments) accelerate payoff
- Example from course: applying cashflow savings to principal turned a 30-year mortgage into a 14-year, 2-month payoff with $237K increase in net worth`
  },
  {
    id: 'refinance',
    title: 'Refinance — The Right Way to Evaluate',
    keywords: ['refinance', 'refi', 'refinancing', 'refi breakeven', 'skip payment', 'interest savings', 'cost of waiting', 'rate drop', 'lower rate'],
    content: `REFINANCE — THE RIGHT WAY TO EVALUATE
- Correct method: Compare interest savings, not payment savings. Principal is the borrower's own money — it's not a cost
- The cost of waiting: If a borrower waits for a lower rate, they're forgoing monthly savings in the meantime. The math often shows locking in now and refinancing later beats waiting
- Do you skip a payment? No. Mortgages are paid in arrears. Interim interest is paid at closing. This is a common misconception`
  },
  {
    id: 'payment_not_cost',
    title: 'Payment Does Not Equal Cost',
    keywords: ['payment', 'cost', 'principal', 'equity', 'true cost', 'compare loans', 'loan comparison', 'cheaper', 'expensive', 'save money'],
    content: `PAYMENT DOES NOT EQUAL COST
- Principal portion of a mortgage payment is NOT a cost — it's equity the borrower is building
- When comparing loans, exclude principal from the cost calculation
- A loan with a higher payment can actually be cheaper if more of each payment goes to principal`
  },
  {
    id: 'debt_consolidation',
    title: 'Debt Consolidation',
    keywords: ['debt consolidation', 'consolidate', 'high interest', 'credit card', 'home equity', 'cashflow', 'cash flow', 'monthly savings', 'debt management'],
    content: `DEBT CONSOLIDATION
- Using home equity to pay off high-interest debt can reduce total monthly obligations even if the mortgage rate is higher than some of the debts
- The key is total monthly cashflow improvement
- Apply the monthly savings back to mortgage principal to accelerate payoff and build wealth faster`
  },
  {
    id: 'apr_flawed',
    title: 'Annual Percentage Rate (APR) — Why It\'s Deeply Flawed',
    keywords: ['apr', 'annual percentage rate', 'breakeven', 'loan triangle', 'closing costs', 'points', 'discount points', 'fees', 'true cost'],
    content: `ANNUAL PERCENTAGE RATE (APR) — WHY IT'S DEEPLY FLAWED
- APR assumes the borrower keeps the loan for the full 30-year term — almost nobody does
- APR assumes zero inflation over 30 years
- APR treats interim interest (prepaid at closing) as a fee, which inflates it unfairly
- APR assumes a constant rate environment
- The Loan Triangle: Loan amount, rate, payment — know any two, solve for the third
- True breakeven vs APR comparison: In the course example, the real breakeven was 18 years, not what APR suggested`
  },
  {
    id: 'bonds',
    title: 'Bonds and Bond Concepts',
    keywords: ['bond', 'bonds', 'treasury', 'treasuries', 'yield', 'coupon', 'par', 'premium', 'discount', 'duration', 'callable', '10-year', 'ten year', 'note', 'bill'],
    content: `BONDS AND BOND CONCEPTS
- Treasury Bills: Maturity of 1 year or less
- Treasury Notes: Maturity of 1-10 years
- Treasury Bonds: Maturity greater than 10 years
- 10-Year Treasury Note: The most watched benchmark, but NOT directly tied to mortgage rates
- Bond pricing: Par (100), Premium (above 100), Discount (below 100)
- Coupon rate: The fixed interest rate paid to the bondholder
- Inverse relationship: Bond price and yield move in opposite directions (seesaw)
- Capital appreciation/loss: Change in bond price between purchase and sale
- Yield to Maturity (YTM): Total return if held to maturity, accounting for price paid
- Duration: Measures bond price sensitivity to interest rate changes. Longer duration = more sensitivity
- Callable bonds: Issuer can redeem early. Investor gets higher coupon but limited upside`
  },
  {
    id: 'mbs',
    title: 'Mortgage Backed Securities (MBS)',
    keywords: ['mbs', 'mortgage backed', 'mortgage-backed', 'pass-through', 'passthrough', 'coupon', 'convexity', 'buying cycle', 'securitization', 'pool'],
    content: `MORTGAGE BACKED SECURITIES (MBS)
- MBS are pools of mortgages packaged and sold to investors
- MBS price movements directly affect mortgage rates
- MBS have a coupon rate and a price component, just like bonds
- MBS coupon is typically ~1% below the borrower's mortgage rate (the spread covers lender, servicer, aggregator, securitizer)

CONVEXITY BUYING CYCLE
- Rate drops → refinances increase → fund duration shortens → fund managers buy 10-year Treasuries to extend duration → Treasury yields fall → MBS become more attractive by comparison → more MBS buying → mortgage rates drop further
- This self-reinforcing cycle can accelerate rate improvements`
  },
  {
    id: 'what_drives_rates',
    title: 'What Drives Rates',
    keywords: ['rates', 'interest rate', 'inflation', 'deflation', 'credit quality', 'default', 'velocity of money', 'what drives', 'rate movement', 'why rates'],
    content: `WHAT DRIVES RATES
- Two main factors: Credit quality/default risk and inflation
- Inflation is the archenemy of bonds — it erodes the buying power of the fixed return
- Inflation defined: Too many dollars chasing too few goods
- Deflation defined: The opposite — falling prices
- Duration amplifies inflation's impact on bond investors
- Velocity of money: How quickly money circulates through the economy. Debt initially creates velocity, then drags on it
- Declining velocity since 2000 = less inflation = downward pressure on rates`
  },
  {
    id: 'stocks_vs_bonds',
    title: 'Stocks vs Bonds',
    keywords: ['stocks', 'stock market', 'safe haven', 'flight to safety', 'bull', 'bear', 'correction', 'market timing', 'geopolitical'],
    content: `STOCKS VS BONDS
- Inverse relationship — they compete for the same investment dollar
- Safe haven flows: Geopolitical risk or economic fear → money flows from stocks to bonds → bond prices rise → rates improve
- Market timing: Bond market 8am-5pm ET, Stock market 9:30am-4pm ET, Lender pricing typically 10-10:30am ET
- Bull vs Bear markets: 10% decline = correction, 20% decline = bear market`
  },
  {
    id: 'economic_reports',
    title: 'Economic Reports',
    keywords: ['economic report', 'cpi', 'pce', 'ppi', 'inflation report', 'jobs report', 'employment', 'unemployment', 'adp', 'bls', 'jobless claims', 'gdp', 'housing starts', 'existing home sales', 'pending home sales', 'case-shiller', 'nahb', 'building permits', 'freight', 'cass'],
    content: `ECONOMIC REPORTS
Why They Matter:
- They measure the health of the economy and directly impact markets and rates
- Reports are judged against market expectations — the surprise factor moves markets
- Stronger than expected = good for stocks, bad for bonds (rates rise)
- Weaker than expected = bad for stocks, good for bonds (rates improve)

Inflation Reports:
- CPI (Consumer Price Index): Fixed basket of goods, heavily weighted toward housing and medical costs
- PCE (Personal Consumption Expenditures): The Fed's preferred measure. Allows substitutions. Tends to underestimate real inflation
- PCE typically runs softer than CPI — yet the Fed prefers it
- Headline vs Core inflation: Core strips out food and energy. Fed focuses on Core
- Inflation is calculated on a rolling 12-month basis: You can predict the trend by comparing what month is rolling off vs what new month replaces it
- PPI (Producer Price Index): Wholesale/producer-level inflation. Leading indicator but rarely moves markets on its own

Employment Reports:
- ADP Report: Private sector only, serves as a preview of the official jobs report
- BLS Jobs Report: First Friday of each month. Establishment Survey (businesses, headline number) + Household Survey (phone calls, unemployment rate)
- U3 vs U6 unemployment: U6 includes part-time workers wanting full-time and discouraged workers. U6 is the better measure
- Average Weekly Earnings is a better indicator of wage-driven inflation than Average Hourly Earnings
- Initial Jobless Claims: Released weekly on Thursday

Housing Reports:
- Existing Home Sales (NAR): ~85% of the market
- Pending Home Sales: Leading indicator — contracts signed but not yet closed
- New Home Sales (Census Bureau): ~15% of the market
- Median home price is NOT appreciation — it's simply the middle-priced home that sold
- Case-Shiller Index: Gold standard for home price measurement, but has a 2-month lag
- Housing Starts and Building Permits: Future supply indicators
- NAHB Housing Market Index: Builder confidence survey. Above 50 = expansion

Other Reports:
- GDP: Quarterly, three readings per quarter. Two consecutive negative quarters = technical recession
- Treasury Bond Auctions: 10-year, 20-year, and 30-year are most important for mortgage markets. Watch bid-to-cover ratio and foreign participation
- Cass Freight Index: Early recession indicator`
  },
  {
    id: 'federal_reserve',
    title: 'The Federal Reserve',
    keywords: ['fed', 'federal reserve', 'fomc', 'fed funds', 'quantitative easing', 'qe', 'quantitative tightening', 'qt', 'dovish', 'hawkish', 'dot plot', 'fed minutes', 'central bank', 'monetary policy', 'fiscal policy', 'repo', 'discount window', 'dual mandate'],
    content: `THE FEDERAL RESERVE
Central Banking Basics:
- Credit brings a future purchase to today. Can create velocity of money initially, then becomes a drag
- Fractional reserves: Banks lend out deposits, keeping ~10% in reserves
- Banks borrow from each other at the Fed Funds Rate, or from the Fed's Discount Window

How the Fed Works:
- Primary function: Ensure smooth market function through injection of liquidity
- Repurchase Agreements (Repos): Short-term borrowing tool — key mechanism for providing liquidity
- Fiscal Policy (government — taxes and spending) vs Monetary Policy (Fed — interest rates and money supply)
- Fed Funds Rate: Lowering = easing (stimulative), Raising = tightening (restrictive)
- Quantitative Easing (QE): Fed buys MBS and Treasuries → pushes prices up, yields/rates down
- Quantitative Tightening (QT): Fed sells or lets holdings run off → prices fall, yields/rates rise

Federal Reserve Structure:
- Federal Reserve Act: Dual mandate = maximum employment + price stability
- FOMC: 19 members, 12 vote at any given meeting
- Board of Governors: 7 members, 14-year terms, appointed by the President
- Dovish: Favors lower rates, focuses on employment
- Hawkish: Favors higher rates, focuses on controlling inflation

Fed Communications:
- FOMC Statements: economic assessment, goals, decision, forward guidance, process explanation, voting record
- Fed Dot Plot: Anonymous forecast showing where each member thinks Fed Funds Rate will be
- Fed Minutes: Released 3 weeks after each meeting. Can move markets

CRITICAL: Fed Funds Rate and mortgage rates are NOT the same — can move in opposite directions. When Fed Funds was at zero (2009-2016), mortgage rates were still 3%-5%. A Fed rate cut can cause mortgage rates to RISE if interpreted as inflationary. Educate clients ahead of expected Fed actions to prevent unrealistic expectations.`
  },
  {
    id: 'money_printing_inflation',
    title: 'Money Printing and Inflation',
    keywords: ['money printing', 'inflation', 'hyperinflation', 'wealth effect', 'tina', 'treasuries', 'currency', 'devalue', 'saving', 'spending'],
    content: `MONEY PRINTING AND INFLATION
- The Wealth Effect: Rising home values and stock prices make people feel wealthier → they spend more → economic activity increases
- TINA ("There Is No Alternative"): The Fed intentionally drives rates low to discourage saving, pushing money into stocks. Ben Bernanke was transparent about this strategy
- Why Treasuries exist: Government borrows by selling Treasuries (full faith and credit of the US, "risk free" at maturity) rather than printing money
- Printing money devalues currency and creates inflation. Germany 1920s hyperinflation: bread went from 63 marks (1918) to 201 billion marks (November 1923). Wiped out everyone's savings instantly
- Hyperinflation = inflation at 50%+ per year`
  },
  {
    id: 'recession_indicators',
    title: 'Recession Indicators',
    keywords: ['recession', 'yield curve', 'inverted', 'inversion', 'unemployment rate', 'corporate debt', 'world trade', 'forecast', 'downturn', 'crystal ball', 'confluence'],
    content: `RECESSION INDICATORS
- Forecasting a recession = forecasting a refinance opportunity
- If recession is on the horizon: avoid paying upfront fees (points, single premium MI), consider higher rate in exchange for closing cost credits

The Unemployment Rate — Most Reliable Indicator (100% Accurate):
- Counter-intuitive: recessions do NOT happen when unemployment is high
- Recessions occur after unemployment hits its LOWEST level and begins to tick higher
- Mechanism: businesses hire to meet demand → unemployment drops → expansion slows → businesses cut headcount → newly unemployed spend less → cycle perpetuates into recession

Increasing Corporate Debt:
- Rising corporate debt often coincides with recessions
- Added debt service makes businesses more vulnerable to downturns

Inverted Yield Curve:
- Normal: longer maturities yield MORE than shorter ones
- Inverted: longer maturities yield LESS — investors expect future price declines (recession)
- Key measure: 10-year yield minus 2-year yield. Negative = inversion
- Recessions historically follow yield curve inversions

Synchronized Recessions:
- Average ~50% of global economies in recession simultaneously
- COVID 2020: ~93% of global economies entered recession

World Trade:
- Recessions occur when world trade breaks below zero and trends lower

Using Your Crystal Ball:
- One indicator alone could signal a recession, but a CONFLUENCE of indicators gives a much stronger forecast`
  },
  {
    id: 'choosing_best_loan',
    title: 'Choosing the Best Loan',
    keywords: ['best loan', 'loan comparison', 'loan strategy', 'which loan', 'rate vs cost', 'cookie cutter', 'advisor', 'debt manager', 'plan loans', 'two at a time', 'puzzle pieces'],
    content: `CHOOSING THE BEST LOAN
- No cookie-cutter answer — each client has unique circumstances: savings goals, cashflow, time in home
- Most loan originators just quote the lowest rate and treat the mortgage as a commodity — the lowest rate may NOT be the best option
- Principal is NOT a cost — it's the customer's equity. Exclude it when comparing loans
- True cost of a loan: Closing costs + interest paid + cost of points (if any) + mortgage insurance (if any)
- Must consider how long the client will hold the loan — this changes which option wins
- Example: Loan A costs $5,000 more total at year 6, but builds $7,500 more in equity → Loan A is actually $2,500 better
- Advisor Consultation: Ask about family growth plans, future college needs, retirement timeline, career changes — these impact how long they'll hold the loan
- Plan loans two at a time — think of the current loan AND the next loan as puzzle pieces. This is what turns you from a rate quoter into a debt manager — their Mortgage Advisor
- CMA advantage: Forecast future rate environments, utilize debt effectively through consolidation, accelerate principal payments with cashflow savings`
  },
  {
    id: 'technical_analysis',
    title: 'Technical Analysis',
    keywords: ['technical analysis', 'support', 'resistance', 'moving average', 'fibonacci', 'stochastic', 'golden cross', 'death cross', 'candlestick', 'candle', 'doji', 'hammer', 'engulfing', 'morning star', 'evening star', 'shooting star', 'gap', 'window', 'double top', 'chart', 'trading'],
    content: `TECHNICAL ANALYSIS
Two Methodologies:
- Eastern Technical Analysis: Focuses on individual candles or candle series — identifies patterns and reversal signals
- Western Technical Analysis: Focuses on target levels that act as support or resistance
- Using both together = best chance of correctly identifying trends

Western Signals:
- Support (floor) and Resistance (ceiling): Self-fulfilling prophecies — professional traders set buy/sell triggers at the same levels
- Moving Averages (25-day, 50-day, 100-day, 200-day): Trend-following indicators. 200-day MA is most significant
- Rule of Polarity: Broken support becomes future resistance, and vice versa
- Leash Effect: When price strays too far from its 25-day MA, it tends to snap back
- Golden Cross (Bullish): 50-day MA crosses above 200-day MA. Death Cross (Bearish): opposite
- Fibonacci Retracement Levels: Based on the Golden Ratio. Levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 76.4%, 100%
- Stochastic Indicator: Measures momentum, overbought (above 80%) / oversold (below 20%). Crossovers signal buy/sell

Eastern Signals:
- Bullish Engulfing / Bearish Engulfing: 2-day reversal patterns
- Bullish Hammer / Bearish Hanging Man: 1-day patterns at trend extremes
- Doji: Signals indecision and upcoming volatility
- Morning Star (bullish) / Evening Star (bearish): 3-day reversal patterns

Signal Confluence:
- No single signal is 100% accurate — they provide an edge, not certainty
- The greater the confluence of signals agreeing, the greater the odds of accuracy`
  },
  {
    id: 'rate_lock',
    title: 'Rate Lock Decisions',
    keywords: ['rate lock', 'lock', 'float', 'locking', 'floating', 'reprice', 'pricing window', 'umbs', 'bond card', 'day change', 'intraday'],
    content: `RATE LOCK DECISIONS
Core Principle:
- The right strategy with a competitive rate beats the lowest rate with the wrong strategy every time
- Rate IS important — you cannot unlock a loan
- Executing at the right time is what matters most

Following Live MBS Pricing:
- Watch the UMBS 30YR Bond Card — three components: Bond Price, Day Change, and Change from Lender Pricing Windows
- Day Change = movement from prior day's close (good to know but NOT the key metric)
- Change from pricing window = how much MBS has moved since YOUR LENDER issued pricing — this is what matters for re-price risk

The Day Change Trap:
- Day Change can show positive while your actual pricing has worsened
- Rule of thumb: Lenders consider re-pricing when MBS moves ~12bp from when they issued pricing

Don't Be Single-Minded on Lock Decisions:
- MBS pricing direction matters, but must be combined with technical analysis
- A Bullish Hammer or drop to key support could mean prices are near a bottom despite worsening
- News and events can override technical signals`
  },
  {
    id: 'key_themes',
    title: 'Key Themes — What Makes a CMA Different',
    keywords: ['cma', 'certified mortgage advisor', 'advisor', 'educate', 'strategy', 'what makes', 'different', 'order taker', 'commodity'],
    content: `KEY THEMES — WHAT MAKES A CMA DIFFERENT

1. Advisor, Not Order Taker: A CMA doesn't just quote rates. They understand the forces that move rates, can forecast where rates are heading, and build the right loan strategy for each client's unique situation — planning loans two at a time and managing debt holistically.

2. Payment Does Not Equal Cost: The single most important concept a CMA can teach borrowers. Principal is equity, not expense. Comparing loans correctly requires excluding principal and focusing on true costs relative to the time the client will hold the loan.

3. Confluence Is Everything: Whether it's recession indicators, technical signals, or rate lock timing — no single data point tells the whole story. The power is in multiple signals confirming the same direction.

4. Educate the Client: Most consumers don't understand that Fed Funds ≠ mortgage rates, that principal isn't a cost, that APR is deeply flawed, or that the lowest rate isn't always the best deal. The CMA's job is to educate and advise, not just transact.

5. The Right Strategy Beats the Lowest Rate: Timing, loan structure, debt consolidation, principal acceleration, and planning for the next loan — these create more value than chasing the absolute lowest rate.`
  },
  {
    id: 'cma_brochure',
    title: 'CMA Brochure — Marketing & Positioning',
    keywords: ['cma', 'certified mortgage advisor', 'designation', 'brochure', 'positioning', 'marketing', 'satisfied', 'confident', 'ethical', 'barry habib'],
    content: `CMA BROCHURE — MARKETING & POSITIONING
- CMAs are extensively trained in all aspects of the economy and financial markets
- CMAs help clients understand how to use mortgage debt to build sustainable, lifelong wealth
- 93% of consumers who work with a CMA say they are extremely or very satisfied
- 89% are more confident about their mortgage investment
- CMAs don't simply quote rates — they assess the client's full financial picture to understand future goals and design a mortgage product that meets those needs
- CMAs commit to ethical standards that require putting clients' interests first
- Barry Habib, CMA Founder: "The best rate with the wrong strategy is much more expensive than a competitive rate with a Certified Mortgage Advisor."`
  },
  {
    id: 'advisory_tools',
    title: 'MBS Highway Advisory Tools',
    keywords: ['buy vs rent', 'affordability', 'amortization calculator', 'appreciation calculator', 'arm vs fixed', 'adjustable rate', 'bid over asking', 'blended rate', 'cost of waiting', 'debt consolidation report', 'equity gained', 'investment property', 'reinvestment', 'refi risk', 'seller contribution', 'buydown', 'advisory tool', 'mbs highway tool'],
    content: `MBS HIGHWAY ADVISORY TOOLS

Buy vs Rent Report: Shows long-term financial impact of buying vs renting. Net Gain = Appreciation Gain + Amortization Gain + Tax Benefit − Cashflow Difference − Closing Costs − Cost to Sell.

Affordability Calculator: Shows what a client can afford. Key outputs: affordable home price, payment breakdown, DTI tolerance (default 43%, some loans allow up to 55%).

Amortization Calculator: Shows how a loan shifts from interest-heavy to principal-heavy payments over time.

Appreciation Calculator: Projects home value growth and ROI over 1-15 years.

ARM vs Fixed Calculator: Compares adjustable vs fixed side by side. Two scenarios: savings kept as cash vs savings applied to principal.

Bid Over Asking: Shows how long to recoup costs of bidding above asking through appreciation.

Blended Rate Calculator: Combines multiple debts into a single weighted average rate.

Cost of Waiting Report: Quantifies the financial cost of delaying a purchase. Core equation: Appreciation Gain + Payment Difference − Cost of Refinance = Benefit of Buying Now.

Debt Consolidation Report: Shows impact of consolidating debts into new mortgage. Front ratio, back ratio, monthly savings, overall savings comparison.

Equity Gained Report: Projects home equity over up to 15 years using appreciation + amortization.

Investment Property Report: Analyzes rental property cash flow, returns, and long-term performance.

Reinvestment Calculator: Illustrates how reinvested funds grow through compound interest.

Refi Risk of Waiting: Shows true cost of delaying a refinance. Cost of Delaying = (Existing Payment − Refi Now Payment) × Months Waiting.

Seller Contribution Report: Compares price reductions, temporary buydowns, permanent buydowns, and seller-paid closing costs.`
  },
  {
    id: 'mbs_pricing_framework',
    title: 'MBS Pricing Framework — How Mortgage Rates Actually Work',
    keywords: ['mbs pricing', 'rate sheet', 'price sheet', 'pass-through', 'pass through', 'note rate', 'servicing fee', 'guaranty fee', 'llpa', 'loan level pricing', 'lock period', 'reprice', 'intraday', 'pricing chain', 'spread', 'prepayment', 'gain on sale', 'hedge', 'rate ladder', 'lender pricing', 'how rates work', 'why rates different', 'two lenders'],
    content: `MBS PRICING FRAMEWORK — HOW MORTGAGE RATES ACTUALLY WORK

The Central Truth: Rates Are a Price Sheet, Not a Menu
- In agency mortgage lending, most retail note rates are typically available on most days. What changes is the price of each rate, not usually the existence of the rate itself.
- The rate sheet is not primarily deciding what rates exist. It is deciding what each rate costs today.

Borrower Note Rate ≠ MBS Pass-Through Rate:
- The pass-through rate is calculated by subtracting the servicing fee and guaranty fee from the borrower interest rate.

Why Almost Every Rate Exists Every Day:
- Retail mortgage pricing is built from a rate ladder. The lender does not usually decide whether 6.125%, 6.250%, 6.375%, or 6.500% "exist." The market determines the economic value of each option.
- One rate may require discount points, another may be near par, and another may generate enough premium to provide lender credits.

What Actually Changes Day to Day:
- The price/yield relationship between the lender's pipeline and the secondary market. If MBS prices fall, lender worsens pricing. If MBS prices rise, lender improves pricing.
- The same 30-year fixed note rate may still be available, but the cost may move from a lender credit to par, or from par to borrower-paid discount points.

The 8 Main Drivers of MBS Pricing:
1. Treasury Market and Base Interest-Rate Moves
2. MBS Spread Changes (spread between MBS yields and benchmark rates)
3. Prepayment Expectations (negative convexity is central to mortgage pricing)
4. Servicing Value (affects what retail rates can be profitably priced)
5. Guaranty Fees (embedded in execution economics)
6. Loan-Level Pricing Adjustments (LLPAs) — credit score, LTV, occupancy, product type, cash-out, etc.
7. Lock Period (longer locks cost more due to market risk and hedge cost)
8. Intraday Volatility and Lender Reprices

How the Pricing Chain Works:
1. Borrower note rate is selected
2. Lender maps that note rate to an expected pass-through execution
3. Pass-through rate = borrower note rate − servicing fee − guaranty fee
4. Lender evaluates sale price in secondary market
5. Lender adjusts for hedge cost, pull-through, servicing value, LLPAs, margin, and lock term
6. Retail price is assigned as points, par, or lender credit

Why Two Lenders Quote Different Prices for the Same Rate:
- Different hedge performance, servicing strategy, gain-on-sale targets, delivery channels, pull-through assumptions, margins, operational costs, lock desk policies, and overlays.

Key Takeaway: Mortgage rates are usually a continuously priced ladder of note-rate options. What changes every day is the market value of each option.`
  }
];

// ============================================================
// TOPIC MATCHING — scores each section against the request text
// ============================================================

function scoreSection(section, searchText) {
  const lower = searchText.toLowerCase();
  let score = 0;

  for (const keyword of section.keywords) {
    if (lower.includes(keyword)) {
      // Longer keyword matches are more specific and valuable
      score += keyword.length;
    }
  }

  // Also check the section title
  const titleWords = section.title.toLowerCase().split(/\s+/);
  for (const word of titleWords) {
    if (word.length > 3 && lower.includes(word)) {
      score += 2;
    }
  }

  return score;
}

// ============================================================
// MAIN EXPORT — returns relevant knowledge as a prompt string
// ============================================================

async function getRelevantKnowledge(requestText, supabaseUrl, supabaseKey) {
  // Score all sections
  const scored = SECTIONS.map(s => ({
    ...s,
    score: scoreSection(s, requestText)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Always include key_themes (short, always relevant)
  const alwaysInclude = ['key_themes'];

  // Collect sections: all with score > 0, plus always-included
  const matched = [];
  const includedIds = new Set();

  // Add scored matches first
  for (const s of scored) {
    if (s.score > 0) {
      matched.push(s.content);
      includedIds.add(s.id);
    }
  }

  // Add always-included sections if not already present
  for (const id of alwaysInclude) {
    if (!includedIds.has(id)) {
      const section = SECTIONS.find(s => s.id === id);
      if (section) {
        matched.push(section.content);
        includedIds.add(id);
      }
    }
  }

  // If nothing matched (very generic request), include key themes + CMA brochure + choosing best loan
  if (matched.length <= 1) {
    const fallbacks = ['cma_brochure', 'choosing_best_loan', 'payment_not_cost'];
    for (const id of fallbacks) {
      if (!includedIds.has(id)) {
        const section = SECTIONS.find(s => s.id === id);
        if (section) {
          matched.push(section.content);
          includedIds.add(id);
        }
      }
    }
  }

  // Cap total content to avoid blowing up prompts (~30KB max from KB)
  let totalChars = 0;
  const finalSections = [];
  for (const content of matched) {
    if (totalChars + content.length > 30000) break;
    finalSections.push(content);
    totalChars += content.length;
  }

  // Fetch custom entries from Supabase if available
  let customEntries = [];
  if (supabaseUrl && supabaseKey) {
    try {
      const resp = await fetch(
        supabaseUrl + '/rest/v1/knowledge_base_custom?select=title,content,keywords&order=created_at.asc',
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json'
          }
        }
      );
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const lower = requestText.toLowerCase();
          for (const row of rows) {
            // Check if any keywords match
            let rowScore = 0;
            if (row.keywords) {
              const kws = row.keywords.split(',').map(k => k.trim().toLowerCase());
              for (const kw of kws) {
                if (kw && lower.includes(kw)) {
                  rowScore += kw.length;
                }
              }
            }
            // Also check title words
            if (row.title) {
              const words = row.title.toLowerCase().split(/\s+/);
              for (const w of words) {
                if (w.length > 3 && lower.includes(w)) {
                  rowScore += 2;
                }
              }
            }
            if (rowScore > 0 || matched.length <= 2) {
              customEntries.push(row);
            }
          }
        }
      }
    } catch (e) {
      // Supabase unavailable — continue with built-in sections only
      console.error('Knowledge base custom entries fetch failed:', e.message);
    }
  }

  // Build the final prompt block
  let output = `\nCMA KNOWLEDGE BASE — USE THIS EXPERTISE IN YOUR WRITING:\nThe following is Kristy's actual CMA (Certified Mortgage Advisor) knowledge. Draw from this material when writing about mortgage topics. These topics are interconnected — use them together when relevant, not in isolation.\n\n`;

  output += finalSections.join('\n\n---\n\n');

  if (customEntries.length > 0) {
    output += '\n\n---\n\nKRISTY\'S ADDITIONAL NOTES:\n\n';
    for (const entry of customEntries) {
      output += (entry.title ? entry.title.toUpperCase() + '\n' : '') + entry.content + '\n\n';
    }
  }

  output += `\n\nIMPORTANT: The knowledge base topics above are interconnected. When writing about one topic (e.g., refinancing), pull in related concepts (e.g., cost of waiting, MBS pricing, amortization, how rates actually work) to give a complete, expert perspective. This is what makes Kristy a CMA — she connects the dots, not just repeats one topic in isolation.`;

  return output;
}

// Also export the full knowledge base for endpoints that want everything
function getFullKnowledgeBase() {
  let output = `\nCMA KNOWLEDGE BASE — USE THIS EXPERTISE IN YOUR WRITING:\nThe following is Kristy's actual CMA (Certified Mortgage Advisor) knowledge. Draw from this material when writing about mortgage topics. These topics are interconnected — use them together when relevant, not in isolation.\n\n`;

  for (const section of SECTIONS) {
    output += section.content + '\n\n---\n\n';
  }

  output += `\nIMPORTANT: The knowledge base topics above are interconnected. When writing about one topic (e.g., refinancing), pull in related concepts (e.g., cost of waiting, MBS pricing, amortization, how rates actually work) to give a complete, expert perspective. This is what makes Kristy a CMA — she connects the dots, not just repeats one topic in isolation.`;

  return output;
}

export { getRelevantKnowledge, getFullKnowledgeBase, SECTIONS };
