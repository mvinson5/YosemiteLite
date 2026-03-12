import { useState, useMemo, useCallback } from "react";

// --- DESIGN TOKENS (Option B: IEQ Option 2 - navy sidebar, light content, mint accents) ---
const C = {
  bg:"#F2F1ED", surface:"#FFFFFF", surface2:"#F8F7F4", surface3:"#ECEAE5",
  border:"#DCD9D0", borderLight:"#E8E5DE",
  // Mint/teal accent from IEQ Option 2 (replaces gold)
  accent:"#3DDBB4", accentDim:"#2AA888", accentFaint:"#3DDBB414",
  // Keep gold for secondary warmth
  gold:"#B8943A", goldDim:"#8A6E2A",
  text:"#1A1C20", textMuted:"#8A8680", textDim:"#6B6860",
  green:"#2D8060", red:"#C04040", blue:"#2E5C94", purple:"#5E4D8E",
  teal:"#2A7878", orange:"#A86838", cyan:"#2E7A94",
  // Navy sidebar
  navBg:"#0F1A2E", navText:"#9CA8B8", navActive:"#182640", navBorder:"#1E2E48",
  navAccent:"#3DDBB4",
};

// ─── 2025 TAX PARAMETERS ────────────────────────────────────────────────────
const TAX_PARAMS = {
  mfj: {
    brackets:[[0.10,0,23200],[0.12,23200,94300],[0.22,94300,201050],[0.24,201050,383900],[0.32,383900,487450],[0.35,487450,731200],[0.37,731200,Infinity]],
    ltcg:[[0,0,96700],[0.15,96700,600050],[0.20,600050,Infinity]],
    std:30000, niitFloor:250000, qbiLow:383900, qbiHigh:483900,
  },
  single: {
    brackets:[[0.10,0,11600],[0.12,11600,47150],[0.22,47150,100525],[0.24,100525,191950],[0.32,191950,243725],[0.35,243725,609350],[0.37,609350,Infinity]],
    ltcg:[[0,0,48350],[0.15,48350,533400],[0.20,533400,Infinity]],
    std:15000, niitFloor:200000, qbiLow:191950, qbiHigh:241950,
  },
  mfs: {
    brackets:[[0.10,0,11600],[0.12,11600,47150],[0.22,47150,100525],[0.24,100525,191950],[0.32,191950,243725],[0.35,243725,365600],[0.37,365600,Infinity]],
    ltcg:[[0,0,48350],[0.15,48350,300025],[0.20,300025,Infinity]],
    std:15000, niitFloor:125000, qbiLow:191950, qbiHigh:241950,
  },
};

const STATE_RATES = {
  CA:{rate:14.3,label:"California"}, NY:{rate:10.9,label:"New York"},
  NYC:{rate:14.78,label:"New York City"}, NJ:{rate:10.75,label:"New Jersey"},
  MA:{rate:9.0,label:"Massachusetts"}, IL:{rate:4.95,label:"Illinois"},
  CT:{rate:6.99,label:"Connecticut"}, WA:{rate:7.0,label:"Washington (LT gains only)"},
  TX:{rate:0,label:"Texas"}, FL:{rate:0,label:"Florida"},
  NV:{rate:0,label:"Nevada"}, WY:{rate:0,label:"Wyoming"},
  CO:{rate:4.4,label:"Colorado"}, PA:{rate:3.07,label:"Pennsylvania"},
  MD:{rate:5.75,label:"Maryland"}, DC:{rate:10.75,label:"Washington DC"},
};

// Six-character income taxonomy:
// ordEarned = ordinary earned (W-2, guaranteed pmts) - NOT subject to NIIT
// ordInv = ordinary investment (interest, NPC, mgmt fees) - subject to NIIT
// stcg = short-term cap gain - capital loss nettable, NIIT
// ltcg = long-term cap gain - preferential rate, capital loss nettable, NIIT
// qualDiv = qualified dividends - preferential rate, NIIT
// passive = passive (rental, passive K-1) - PAL rules, NIIT
// taxExempt = muni interest, exempt
const CHARS = {
  ordEarned:{label:"Ordinary (Earned)",short:"Ord-E",color:C.blue},
  ordInv:{label:"Ordinary (Investment)",short:"Ord-I",color:C.cyan},
  stcg:{label:"Short-Term Cap Gain",short:"STCG",color:C.orange},
  ltcg:{label:"Long-Term Cap Gain",short:"LTCG",color:C.green},
  qualDiv:{label:"Qualified Dividend",short:"QDiv",color:C.green},
  passive:{label:"Passive",short:"Pass",color:C.purple},
  taxExempt:{label:"Tax-Exempt",short:"Exempt",color:C.teal},
};
const INCOME_TYPES = {
  w2:           {label:"W-2 Wages / Salary",           char:"ordEarned", color:C.blue,   desc:"Employment wages, bonus, RSU vest"},
  k1_ordinary:  {label:"K-1 Ordinary Business Income", char:"ordEarned", color:C.blue,   desc:"Partnership ordinary business income"},
  k1_guaranteed:{label:"K-1 Guaranteed Payment",       char:"ordEarned", color:C.blue,   desc:"Partner draw (BigLaw, PE mgmt fee)"},
  k1_ord_inv:   {label:"K-1 Ordinary (Investment)",    char:"ordInv",    color:C.cyan,   desc:"Interest, NPC ordinary from fund"},
  k1_stcg:      {label:"K-1 Short-Term Cap Gain",      char:"stcg",      color:C.orange, desc:"STCG - nets against capital losses first"},
  k1_ltcg:      {label:"K-1 LTCG / Carried Interest",  char:"ltcg",      color:C.green,  desc:"Fund capital gains, carried interest"},
  k1_qual_div:  {label:"K-1 Qualified Dividends",      char:"qualDiv",   color:C.green,  desc:"Qualified dividends from pass-through"},
  rental:       {label:"Net Rental Income",             char:"passive",   color:C.purple, desc:"Net rental income after depreciation"},
  interest:     {label:"Interest Income",               char:"ordInv",    color:C.cyan,   desc:"Savings, CDs, money market"},
  qual_div:     {label:"Qualified Dividends (Direct)",  char:"qualDiv",   color:C.green,  desc:"Direct equity dividends"},
  ord_div:      {label:"Non-Qualified Dividends",       char:"ordInv",    color:C.cyan,   desc:"REIT, money market distributions"},
  muni_interest:{label:"Municipal Bond Interest",       char:"taxExempt", color:C.teal,   desc:"Tax-exempt muni interest"},
  other_ord:    {label:"Other Ordinary Income",         char:"ordEarned", color:C.textDim,desc:"Alimony, misc."},
  other_ltcg:   {label:"Other LTCG",                   char:"ltcg",      color:C.green,  desc:"Direct realized gains"},
  other_stcg:   {label:"Other STCG",                   char:"stcg",      color:C.orange, desc:"Direct short-term gains/losses"},
};

const INVESTMENT_PRESETS = [
  {label:"AQR Delphi Plus",     nav:5400000, mgmtFee:2.0, perfFee:20, ordPct:-30, stcgPct:0,   ltcgPct:25,  qualDivPct:5,  intPct:0, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"AQR Flex SMA (F145)", nav:3000000, mgmtFee:0.55,perfFee:0,  ordPct:0,   stcgPct:-32, ltcgPct:0,   qualDivPct:1.2,intPct:0, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"AQR Flex SMA (F250)", nav:3000000, mgmtFee:0.55,perfFee:0,  ordPct:0,   stcgPct:-50, ltcgPct:0,   qualDivPct:1,  intPct:0, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"AQR Helix (Trend)",   nav:5000000, mgmtFee:2.0, perfFee:20, ordPct:-20, stcgPct:-5,  ltcgPct:10,  qualDivPct:0,  intPct:0, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"PE Fund (Buyout)",    nav:5000000, mgmtFee:2.0, perfFee:20, ordPct:-2,  stcgPct:0,   ltcgPct:18,  qualDivPct:0,  intPct:0, taxExPct:0, distPct:12, capCallPct:25},
  {label:"PE Fund (Growth)",    nav:2000000, mgmtFee:2.0, perfFee:20, ordPct:-1,  stcgPct:0,   ltcgPct:22,  qualDivPct:0,  intPct:0, taxExPct:0, distPct:8,  capCallPct:30},
  {label:"Hedge Fund (L/S Eq)", nav:3000000, mgmtFee:1.5, perfFee:20, ordPct:2,   stcgPct:4,   ltcgPct:3,   qualDivPct:1,  intPct:1, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"RE Fund (Value-Add)", nav:2000000, mgmtFee:1.5, perfFee:20, ordPct:-8,  stcgPct:0,   ltcgPct:12,  qualDivPct:0,  intPct:0, taxExPct:0, distPct:10, capCallPct:30},
  {label:"Muni Bond Fund",      nav:4000000, mgmtFee:0.3, perfFee:0,  ordPct:0,   stcgPct:0,   ltcgPct:0,   qualDivPct:0,  intPct:0, taxExPct:3.5,distPct:0, capCallPct:0},
  {label:"Direct Index (SMA)",  nav:8000000, mgmtFee:0.35,perfFee:0,  ordPct:0.5, stcgPct:-8,  ltcgPct:-2,  qualDivPct:1.5,intPct:0, taxExPct:0, distPct:0,  capCallPct:0},
  {label:"Venture Fund",        nav:1000000, mgmtFee:2.5, perfFee:25, ordPct:-3,  stcgPct:0,   ltcgPct:0,   qualDivPct:0,  intPct:0, taxExPct:0, distPct:0,  capCallPct:40},
  {label:"Credit / Mezz Fund",  nav:3000000, mgmtFee:1.25,perfFee:15, ordPct:8,   stcgPct:0,   ltcgPct:0,   qualDivPct:0,  intPct:4, taxExPct:0, distPct:8,  capCallPct:10},
];

const ENTITY_PRESETS = [
  {label:"Individual",         type:"individual",  filing:"1040",         color:C.gold},
  {label:"Revocable Trust",    type:"revTrust",    filing:"Grantor → 1040",color:C.blue},
  {label:"Irrevocable Trust",  type:"irrevTrust",  filing:"1041",         color:C.purple},
  {label:"LLC (Disregarded)",  type:"llcDisregard", filing:"Sch E/C",     color:C.teal},
  {label:"LLC (Partnership)",  type:"llcPartner",  filing:"1065 → K-1",   color:C.teal},
  {label:"S-Corp",             type:"sCorp",       filing:"1120S → K-1",  color:C.orange},
  {label:"C-Corp",             type:"cCorp",       filing:"1120",         color:C.red},
  {label:"LP / Partnership",   type:"partnership", filing:"1065 → K-1",   color:C.purple},
  {label:"Pvt. Foundation",    type:"foundation",  filing:"990-PF",       color:C.green},
  {label:"DAF",                type:"daf",         filing:"Donor — N/A",  color:C.green},
];

const DEDUCTION_TYPES = [
  {id:"salt",label:"SALT (capped $10K)",max:10000},
  {id:"mortgage",label:"Mortgage Interest"},
  {id:"charitable",label:"Charitable Contributions"},
  {id:"medical",label:"Medical (>7.5% AGI)"},
  {id:"advisor",label:"Investment Advisory Fees (2% floor suspended)"},
  {id:"other",label:"Other Itemized"},
];

// ─── TAX ENGINE ─────────────────────────────────────────────────────────────
function bracketTax(taxable, brackets) {
  let tax = 0;
  for (const [rate, min, max] of brackets) {
    if (taxable <= min) break;
    tax += (Math.min(taxable, max) - min) * rate;
  }
  return tax;
}

function ltcgStack(ordTaxable, ltcgAmt, brackets) {
  let tax = 0, filled = ordTaxable;
  for (const [rate, min, max] of brackets) {
    if (filled >= max) continue;
    const start = Math.max(filled, min);
    const end = Math.min(filled + ltcgAmt, max);
    if (end <= start) continue;
    tax += (end - start) * rate;
    ltcgAmt -= (end - start);
    filled = end;
    if (ltcgAmt <= 0) break;
  }
  return tax;
}

function computeTax(profile, streams, assets, deductions) {
  const p = TAX_PARAMS[profile.filingStatus] || TAX_PARAMS.mfj;

  // Step 1: Aggregate income by six characters + withholding
  let ordEarned=0, ordInv=0, stcg=0, ltcg=0, qualDiv=0, passive=0, taxExempt=0;
  let totalFedWithholding=0, totalStateWithholding=0;
  streams.forEach(s => {
    const t = INCOME_TYPES[s.type];
    if (!t) return;
    const a = s.amount || 0;
    if (t.char==="ordEarned") ordEarned+=a;
    else if (t.char==="ordInv") ordInv+=a;
    else if (t.char==="stcg") stcg+=a;
    else if (t.char==="ltcg") ltcg+=a;
    else if (t.char==="qualDiv") qualDiv+=a;
    else if (t.char==="passive") passive+=a;
    else if (t.char==="taxExempt") taxExempt+=a;
    // Withholding
    totalFedWithholding += a * (s.fedWithholdingPct||0) / 100;
    totalStateWithholding += a * (s.stateWithholdingPct||0) / 100;
  });

  // From assets — all asset types that generate income
  let invDistributions=0, invCapCalls=0;
  assets.forEach(item => {
    const at = item.assetType;
    if (at==="cash") {
      // Cash/money market → interest income (ordinary investment)
      ordInv += (item.value||0) * (item.yieldPct||0) / 100;
    } else if (at==="security") {
      // Public securities → qualified dividends + realized gains
      qualDiv += (item.value||0) * (item.divYieldPct||0) / 100;
      ltcg += (item.value||0) * (item.realizedGainPct||0) / 100;
    } else if (at==="hedgeFund" || at==="peFund") {
      const nav = item.nav || 0;
      ordInv     += nav * (item.ordPct || 0) / 100;
      stcg       += nav * (item.stcgPct || 0) / 100;
      ltcg       += nav * (item.ltcgPct || 0) / 100;
      qualDiv    += nav * (item.qualDivPct || 0) / 100;
      ordInv     += nav * (item.intPct || 0) / 100;
      taxExempt  += nav * (item.taxExPct || 0) / 100;
      invDistributions += nav * (item.distPct || 0) / 100;
      invCapCalls += (item.unfunded||0) * (item.capCallPct || 0) / 100;
    }
  });

  // Step 2: Schedule D capital gain netting
  let netST = stcg, netLT = ltcg;
  let netSTAfter=netST, netLTAfter=netLT, capitalLossOffset=0, capitalLossCarry=0;

  if (netST >= 0 && netLT >= 0) {
    // both gains - taxed at respective rates
  } else if (netST < 0 && netLT >= 0) {
    netLTAfter = netLT + netST; netSTAfter = 0;
    if (netLTAfter < 0) { capitalLossOffset = Math.min(3000, Math.abs(netLTAfter)); capitalLossCarry = Math.max(0, Math.abs(netLTAfter)-3000); netLTAfter = 0; }
  } else if (netST >= 0 && netLT < 0) {
    netSTAfter = netST + netLT; netLTAfter = 0;
    if (netSTAfter < 0) { capitalLossOffset = Math.min(3000, Math.abs(netSTAfter)); capitalLossCarry = Math.max(0, Math.abs(netSTAfter)-3000); netSTAfter = 0; }
  } else {
    const totLoss = Math.abs(netST) + Math.abs(netLT);
    capitalLossOffset = Math.min(3000, totLoss); capitalLossCarry = Math.max(0, totLoss-3000);
    netSTAfter = 0; netLTAfter = 0;
  }

  // Step 3: Taxable income
  const totalOrdinary = ordEarned + ordInv + passive + netSTAfter - capitalLossOffset;
  const totalPref = netLTAfter + qualDiv;
  const agi = Math.max(0, totalOrdinary + totalPref);

  // QBI
  const qbiBase = streams.filter(s => s.qbi).reduce((t, s) => t + (s.amount||0), 0) * 0.20;
  let qbiDeduction = 0;
  if (agi <= p.qbiLow) qbiDeduction = Math.min(qbiBase, Math.max(0,totalOrdinary)*0.20);
  else if (agi < p.qbiHigh) { const frac = 1-(agi-p.qbiLow)/(p.qbiHigh-p.qbiLow); qbiDeduction = Math.min(qbiBase*frac, Math.max(0,totalOrdinary)*0.20); }
  qbiDeduction = Math.max(0, qbiDeduction);

  const itemizedRaw = deductions.reduce((t,d) => d.type==="salt" ? t+Math.min(d.amount||0,10000) : t+(d.amount||0), 0);
  const useItemized = itemizedRaw > p.std;
  const deductionAmt = (useItemized ? itemizedRaw : p.std) + qbiDeduction;

  const taxableOrd = Math.max(0, totalOrdinary - deductionAmt);
  const taxablePref = Math.max(0, totalPref);

  // Step 4: Tax computation
  const ordTax = bracketTax(taxableOrd, p.brackets);
  const prefTax = ltcgStack(taxableOrd, taxablePref, p.ltcg);

  // Step 5: NIIT - ordEarned is EXCLUDED from NII
  const nii = Math.max(0, ordInv + Math.max(0,netSTAfter) + netLTAfter + qualDiv + passive);
  const niitBase = Math.max(0, agi - p.niitFloor);
  const niit = Math.min(nii, niitBase) * 0.038;

  const federalTax = ordTax + prefTax + niit;
  const stateTax = Math.max(0, agi * ((profile.stateRate||0)/100) * 0.88);
  const totalTax = federalTax + stateTax;

  const topBracket = p.brackets.slice().reverse().find(([,min]) => taxableOrd > min);
  const marginalOrd = topBracket ? topBracket[0]*100 : 10;
  const topPrefBr = p.ltcg.slice().reverse().find(([,min]) => (taxableOrd+taxablePref) > min);
  const marginalPref = topPrefBr ? topPrefBr[0]*100 : 0;

  // Safe harbor — withholding counts toward prepayment
  const priorY = profile.priorYearLiability||0;
  const priorAgi = profile.priorYearAgi||0;
  const safeHarborPY = priorY * (priorAgi>150000?1.10:1.00);
  const safeHarborCY = federalTax * 0.90;
  const safeHarborTarget = Math.min(safeHarborPY||Infinity, safeHarborCY);
  const totalEstPaid = (profile.q1Paid||0)+(profile.q2Paid||0)+(profile.q3Paid||0)+(profile.q4Paid||0);
  const totalPrepaid = totalFedWithholding + totalEstPaid;
  const remainingSH = safeHarborPY>0 ? Math.max(0,safeHarborTarget-totalPrepaid) : 0;
  const penaltyEst = remainingSH * 0.08;

  // Balance due after all prepayments
  const balanceDueFed = Math.max(0, (federalTax) - totalFedWithholding - totalEstPaid);
  const balanceDueState = Math.max(0, stateTax - totalStateWithholding);
  const overpaymentFed = Math.max(0, totalFedWithholding + totalEstPaid - federalTax);

  // Net cash — income is NET of withholding (what actually deposits)
  const totalWithholding = totalFedWithholding + totalStateWithholding;
  const grossIncome = agi + taxExempt;
  const netAfterWithholding = grossIncome - totalWithholding;
  const netCashAfterTax = netAfterWithholding - totalEstPaid - balanceDueFed - balanceDueState
    - (profile.livingExpenses||0)*12 - (profile.debtService||0)*12
    + invDistributions - invCapCalls;

  const invOrdinary = assets.filter(a=>a.assetType==="hedgeFund"||a.assetType==="peFund").reduce((t,a) => t + (a.nav||0)*(a.ordPct||0)/100, 0);
  const ordLossBenefit = invOrdinary < 0 ? Math.abs(invOrdinary) * (marginalOrd/100) : 0;

  return {
    ordEarned, ordInv, stcg, ltcg, qualDiv, passive, taxExempt,
    netST, netLT, netSTAfter, netLTAfter, capitalLossOffset, capitalLossCarry,
    invOrdinary,
    totalOrdinary, totalPref, agi,
    qbiDeduction, itemizedRaw, useItemized, deductionAmt,
    taxableOrd, taxablePref,
    ordTax, prefTax, niit, nii, federalTax, stateTax, totalTax,
    effectiveRate: agi>0 ? totalTax/agi*100 : 0,
    effectiveFederal: agi>0 ? federalTax/agi*100 : 0,
    marginalOrd, marginalPref,
    // Withholding
    totalFedWithholding, totalStateWithholding, totalWithholding,
    // Safe harbor (now includes withholding)
    safeHarborPY, safeHarborCY, safeHarborTarget, totalEstPaid, totalPrepaid,
    remainingSH, penaltyEst,
    balanceDueFed, balanceDueState, overpaymentFed,
    // Cash flow
    invDistributions, invCapCalls, invTaxExempt: taxExempt,
    netCashAfterTax, ordLossBenefit,
    // Back-compat
    totalLTCG: totalPref, taxableLTCG: taxablePref, ltcgTax: prefTax, marginalLTCG: marginalPref,
    safeHarborMin: safeHarborTarget, totalPaid: totalEstPaid,
  };
}

// ─── BALANCE SHEET ENGINE ──────────────────────────────────────────────────
function computeBalanceSheet(assets) {
  let tiers = {1:0,2:0,3:0,4:0,R:0};
  let totalAssets=0, totalBasis=0, totalEmbeddedGain=0, totalUnfunded=0, totalLiabilities=0;
  let fundCount=0, nonFundCount=0;

  assets.forEach(a => {
    const at = a.assetType;
    let val=0, basis=0;
    if (at==="cash") { val=a.value||0; basis=val; tiers[1]+=val; nonFundCount++; }
    else if (at==="security") { val=a.value||0; basis=a.costBasis||val; tiers[2]+=val; nonFundCount++; }
    else if (at==="hedgeFund") { val=a.nav||0; basis=a.adjBasis||a.costBasis||val; tiers[3]+=val; fundCount++; }
    else if (at==="peFund") { val=a.nav||0; basis=a.adjBasis||a.costBasis||val; tiers[4]+=val; totalUnfunded+=a.unfunded||0; fundCount++; }
    else if (at==="realEstate") { val=a.value||0; basis=a.costBasis||val; tiers[4]+=val; totalLiabilities+=a.mortgage||0; nonFundCount++; }
    else if (at==="retirement") { val=a.value||0; basis=0; tiers["R"]+=val; nonFundCount++; }
    totalAssets+=val; totalBasis+=basis; totalEmbeddedGain+=Math.max(0,val-basis);
  });

  const netWorth = totalAssets - totalLiabilities;
  const liquidNW = tiers[1] + tiers[2] - totalLiabilities;
  return { tiers, totalAssets, totalBasis, totalEmbeddedGain, totalUnfunded, totalLiabilities, netWorth, liquidNW, fundCount, nonFundCount };
}

// ─── MONTHLY CASH FLOW ENGINE ───────────────────────────────────────────────
function computeMonthlyCashflow(profile, streams, assets, result) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const qMap = {3:"q1Paid",5:"q2Paid",8:"q3Paid",0:"q4Paid"};
  const qDue = {3:"Apr 15",5:"Jun 15",8:"Sep 15",0:"Jan 15"};
  const livingExp = profile.livingExpenses || 0;
  const debtSvc = profile.debtService || 0;

  let cumulative = 0;
  return months.map((m, i) => {
    // Gross income per stream, with withholding computed per stream
    let grossIn=0, withholding=0;
    streams.forEach(s => {
      const timing = s.timing || "monthly";
      let amt = 0;
      if (timing === "monthly") amt = (s.amount||0) / 12;
      else if (timing === "quarterly" && [2,5,8,11].includes(i)) amt = (s.amount||0) / 4;
      else if (timing === "annual" && i === (s.timingMonth ?? 11)) amt = s.amount||0;
      else if (timing === "semi" && [5,11].includes(i)) amt = (s.amount||0) / 2;
      grossIn += amt;
      withholding += amt * ((s.fedWithholdingPct||0) + (s.stateWithholdingPct||0)) / 100;
    });

    // Investment distributions (semi-annual Jun/Dec)
    if ([5,11].includes(i)) grossIn += result.invDistributions / 2;

    const cashIn = grossIn - withholding;

    // Estimated tax payments (quarterly)
    let estPmt = 0;
    if (qMap[i] !== undefined) estPmt = profile[qMap[i]] || 0;

    // Cap calls (quarterly)
    let capCall = 0;
    if ([2,5,8,11].includes(i)) capCall = result.invCapCalls / 4;

    const net = cashIn - livingExp - debtSvc - estPmt - capCall;
    cumulative += net;

    return { month:m, idx:i, grossIn, withholding, cashIn, estPmt, livingExp, debtSvc, capCall, net, cumulative, qDue:qDue[i] };
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fmtD = (n, short = false) => {
  if (short) {
    if (Math.abs(n) >= 1e6) return `${n < 0 ? "(" : ""}$${(Math.abs(n) / 1e6).toFixed(1)}M${n < 0 ? ")" : ""}`;
    if (Math.abs(n) >= 1e3) return `${n < 0 ? "(" : ""}$${(Math.abs(n) / 1e3).toFixed(0)}K${n < 0 ? ")" : ""}`;
  }
  const sign = n < 0 ? "(" : "";
  const end = n < 0 ? ")" : "";
  return `${sign}$${fmt(Math.abs(n))}${end}`;
};
const pct = (n) => `${(n || 0).toFixed(1)}%`;

const DEFAULT_PROFILE = {
  name: "", filingStatus: "mfj", state: "NY", stateRate: 10.9,
  priorYearLiability: 0, priorYearAgi: 0,
  q1Paid: 0, q2Paid: 0, q3Paid: 0, q4Paid: 0,
  livingExpenses: 0, debtService: 0,
};

const TABS = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "balsheet", label: "Balance Sheet", icon: "#" },
  { id: "income", label: "Income", icon: "⟳" },
  { id: "deductions", label: "Deductions", icon: "§" },
  { id: "cashflow", label: "Cash Flow", icon: "⊞" },
  { id: "entities", label: "Entities", icon: "⬡" },
  { id: "esttax", label: "Est. Tax", icon: "⊕" },
];

// ─── UI COMPONENTS ──────────────────────────────────────────────────────────
function Badge({ children, color = C.accent }) {
  return <span style={{
    fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
    background: color + "18", color, border: `1px solid ${color}30`,
    borderRadius: 3, padding: "2px 6px", fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap"
  }}>{children}</span>;
}

function Card({ children, style = {}, ...rest }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, ...style }} {...rest}>{children}</div>;
}

function SectionHeader({ children, sub, right }) {
  return <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: C.textMuted, marginBottom: 4 }}>{children}</div>
      {sub && <div style={{ fontSize: 12, color: C.textDim }}>{sub}</div>}
    </div>
    {right}
  </div>;
}

function Btn({ children, onClick, variant = "default", style: sx = {} }) {
  const base = { border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, padding: "7px 14px", fontFamily: "inherit", transition: "all .15s" };
  const variants = {
    default: { background: C.surface3, color: C.textDim, ...base },
    gold: { background: C.accent, color: "#0F1A2E", fontWeight: 500, ...base },
    danger: { background: C.red + "22", color: C.red, ...base },
    ghost: { background: "transparent", color: C.textDim, ...base, padding: "4px 8px" },
  };
  return <button onClick={onClick} style={{ ...variants[variant], ...sx }}>{children}</button>;
}

function Field({ label, children, style: sx = {} }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4, ...sx }}>
    <label style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</label>
    {children}
  </div>;
}

function Input({ value, onChange, type = "text", prefix, style: sx = {}, ...rest }) {
  return <div style={{ display: "flex", alignItems: "center", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 10px" }}>
    {prefix && <span style={{ fontSize: 11, color: C.textMuted, marginRight: 4 }}>{prefix}</span>}
    <input value={value} onChange={onChange} type={type} {...rest}
      style={{ background: "none", border: "none", color: C.text, fontSize: 13, padding: "8px 0", outline: "none", width: "100%", fontFamily: "'IBM Plex Mono',monospace", ...sx }} />
  </div>;
}

function Select({ value, onChange, options }) {
  return <select value={value} onChange={onChange} style={{
    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text,
    fontSize: 12, padding: "8px 10px", outline: "none", fontFamily: "inherit", cursor: "pointer",
  }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}

// ─── MODAL / PANEL ──────────────────────────────────────────────────────────
function SlidePanel({ open, onClose, title, children }) {
  if (!open) return null;
  return <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
    <div style={{
      position: "relative", width: 480, maxWidth: "90vw", background: C.surface,
      borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      overflow: "hidden", animation: "slideIn .2s ease-out",
    }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{title}</div>
        <Btn variant="ghost" onClick={onClose}>✕</Btn>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>{children}</div>
    </div>
  </div>;
}

// ─── INCOME EDITOR ──────────────────────────────────────────────────────────
function IncomePanel({ stream, onSave, onDelete, onClose, entities }) {
  const [s, setS] = useState(stream || {
    id: uid(), type: "w2", label: "", amount: 0, timing: "monthly", timingMonth: 11,
    qbi: false, entity: "",
    fedWithholdingPct: 0, stateWithholdingPct: 0, pteElection: false,
  });
  const upd = (k, v) => setS(prev => ({ ...prev, [k]: v }));
  const typeInfo = INCOME_TYPES[s.type];
  const withAmt = (s.amount||0) * ((s.fedWithholdingPct||0)+(s.stateWithholdingPct||0))/100;
  const netCash = (s.amount||0) - withAmt;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <Field label="Income Type">
      <Select value={s.type} onChange={e => upd("type", e.target.value)}
        options={Object.entries(INCOME_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
    </Field>
    {typeInfo && <div style={{ fontSize: 11, color: C.textDim, marginTop: -8 }}>
      <Badge color={typeInfo.color}>{CHARS[typeInfo.char]?.short || typeInfo.char}</Badge>
      <span style={{ marginLeft: 8 }}>{typeInfo.desc}</span>
    </div>}
    <Field label="Label / Description">
      <Input value={s.label} onChange={e => upd("label", e.target.value)} placeholder="e.g. Partner draw - BigLaw Test" />
    </Field>
    <Field label="Annual Amount">
      <Input value={s.amount} onChange={e => upd("amount", Number(e.target.value))} type="number" prefix="$" />
    </Field>
    <Field label="Timing">
      <Select value={s.timing} onChange={e => upd("timing", e.target.value)}
        options={[
          { value: "monthly", label: "Monthly (1/12 each month)" },
          { value: "quarterly", label: "Quarterly (Mar/Jun/Sep/Dec)" },
          { value: "semi", label: "Semi-Annual (Jun/Dec)" },
          { value: "annual", label: "Annual (single month)" },
        ]} />
    </Field>
    {s.timing === "annual" && <Field label="Month Received">
      <Select value={s.timingMonth} onChange={e => upd("timingMonth", Number(e.target.value))}
        options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => ({ value: i, label: m }))} />
    </Field>}
    <Field label="Entity / Source">
      <Select value={s.entity||""} onChange={e => upd("entity", e.target.value)}
        options={[{value:"",label:"-- Select Entity --"}, ...(entities||[]).map(e => ({value:e.label,label:e.label}))]} />
    </Field>
    {/* Withholding */}
    <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
      {"Withholding (reduces cash received, credits against tax)"}
    </div>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
      <Field label="Federal W/H %"><Input value={s.fedWithholdingPct||0} onChange={e => upd("fedWithholdingPct", Number(e.target.value))} type="number" /></Field>
      <Field label="State W/H %"><Input value={s.stateWithholdingPct||0} onChange={e => upd("stateWithholdingPct", Number(e.target.value))} type="number" /></Field>
    </div>
    <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.textDim, cursor:"pointer" }}>
      <input type="checkbox" checked={s.pteElection||false} onChange={e => upd("pteElection", e.target.checked)} />
      {"PTE/SALT workaround (entity-level state tax payment)"}
    </label>
    {(s.fedWithholdingPct > 0 || s.stateWithholdingPct > 0) && <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
      <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim }}>
        <span>{"Gross Annual"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace" }}>{fmtD(s.amount||0, true)}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", color:C.orange, marginTop:3 }}>
        <span>{"Withholding"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace" }}>({fmtD(withAmt, true)})</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", color:C.green, marginTop:3, borderTop:`1px solid ${C.border}`, paddingTop:3 }}>
        <span>{"Net Cash Received"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace" }}>{fmtD(netCash, true)}</span>
      </div>
      {s.timing==="monthly" && <div style={{ fontSize:10, color:C.textMuted, marginTop:4 }}>
        Monthly deposit: {fmtD(netCash/12)} (gross {fmtD((s.amount||0)/12)})
      </div>}
    </div>}
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textDim, cursor: "pointer" }}>
      <input type="checkbox" checked={s.qbi} onChange={e => upd("qbi", e.target.checked)} />
      {"Qualifies for Sec. 199A QBI deduction"}
    </label>
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <Btn variant="gold" onClick={() => onSave(s)} style={{ flex: 1 }}>Save Income Stream</Btn>
      {stream && <Btn variant="danger" onClick={() => onDelete(s.id)}>Delete</Btn>}
    </div>
  </div>;
}

// ─── UNIFIED ASSET EDITOR ──────────────────────────────────────────────────
function AssetEditor({ asset, onSave, onDelete, entities }) {
  const [a, setA] = useState(asset || {
    id:uid(), assetType:"cash", label:"", value:0, nav:0, costBasis:0, adjBasis:0, unfunded:0,
    totalReturnPct:0, mgmtFee:0, perfFee:0,
    ordPct:0, stcgPct:0, ltcgPct:0, qualDivPct:0, intPct:0, taxExPct:0,
    distPct:0, capCallPct:0, entity:"", mortgage:0,
  });
  const upd = (k,v) => setA(p => ({...p, [k]:v}));
  const isFund = a.assetType==="hedgeFund" || a.assetType==="peFund";

  const applyPreset = (preset) => {
    setA(prev => ({ ...prev, ...preset, id:prev.id, label:prev.label||preset.label, entity:prev.entity,
      assetType: preset.label?.includes("PE")||preset.label?.includes("Venture")||preset.label?.includes("Credit")||preset.label?.includes("RE Fund") ? "peFund" : "hedgeFund",
    }));
  };

  const nav = a.nav||0;
  const val = isFund ? nav : (a.value||0);
  const basis = isFund ? (a.adjBasis||a.costBasis||0) : (a.costBasis||val);
  const gain = Math.max(0, val - basis);
  const recogNet = isFund ? ((a.ordPct||0)+(a.stcgPct||0)+(a.ltcgPct||0)+(a.qualDivPct||0)+(a.intPct||0)+(a.taxExPct||0)) : 0;

  return <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
    <Field label="Asset Type">
      <Select value={a.assetType} onChange={e => upd("assetType", e.target.value)}
        options={[
          {value:"cash",label:"Cash / Money Market"},
          {value:"security",label:"Public Securities"},
          {value:"hedgeFund",label:"Hedge Fund Interest"},
          {value:"peFund",label:"PE / VC Fund Interest"},
          {value:"realEstate",label:"Real Estate"},
          {value:"retirement",label:"Retirement Account"},
        ]} />
    </Field>
    <Field label="Label"><Input value={a.label||""} onChange={e => upd("label", e.target.value)} /></Field>
    <Field label="Entity">
      <Select value={a.entity||""} onChange={e => upd("entity", e.target.value)}
        options={[{value:"",label:"-- Select Entity --"}, ...(entities||[]).map(e => ({value:e.label,label:e.label}))]} />
    </Field>

    {/* Cash */}
    {a.assetType==="cash" && <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Balance"><Input value={a.value||0} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Yield %"><Input value={a.yieldPct||0} onChange={e => upd("yieldPct", Number(e.target.value))} type="number" /></Field>
      </div>
      {(a.yieldPct||0) > 0 && <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
        <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim }}>
          <span>{"Annual Interest (Ord. Investment)"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.cyan }}>{fmtD((a.value||0)*(a.yieldPct||0)/100, true)}</span>
        </div>
      </div>}
    </>}

    {/* Securities */}
    {a.assetType==="security" && <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Current Value"><Input value={a.value||0} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis||0} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Dividend Yield %"><Input value={a.divYieldPct||0} onChange={e => upd("divYieldPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Est. Realized Gain %"><Input value={a.realizedGainPct||0} onChange={e => upd("realizedGainPct", Number(e.target.value))} type="number" /></Field>
      </div>
      {gain > 0 && <div style={{ fontSize:11, color:C.orange }}>{"Embedded gain: "}{fmtD(gain, true)}</div>}
      {((a.divYieldPct||0) > 0 || (a.realizedGainPct||0) !== 0) && <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
        {(a.divYieldPct||0) > 0 && <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim }}>
          <span>{"Qualified Dividends"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.green }}>{fmtD((a.value||0)*(a.divYieldPct||0)/100, true)}</span>
        </div>}
        {(a.realizedGainPct||0) !== 0 && <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim, marginTop:3 }}>
          <span>{"Est. Realized LTCG"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:(a.realizedGainPct||0)>=0?C.green:C.red }}>{fmtD((a.value||0)*(a.realizedGainPct||0)/100, true)}</span>
        </div>}
      </div>}
    </>}

    {/* Fund interests (HF + PE) */}
    {isFund && <>
      <div style={{ fontSize:10, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Presets</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
        {INVESTMENT_PRESETS.map((p, i) => (
          <Btn key={i} variant="ghost" onClick={() => applyPreset(p)}
            style={{ fontSize:9, border:`1px solid ${C.border}`, borderRadius:3 }}>{p.label}</Btn>
        ))}
      </div>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {"Layer 1: Balance Sheet"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Field label="Current NAV"><Input value={a.nav||0} onChange={e => upd("nav", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis||0} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Adj. Tax Basis"><Input value={a.adjBasis||0} onChange={e => upd("adjBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Field label="Unfunded"><Input value={a.unfunded||0} onChange={e => upd("unfunded", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Total Return %"><Input value={a.totalReturnPct||0} onChange={e => upd("totalReturnPct", Number(e.target.value))} type="number" /></Field>
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
          {gain > 0 && <div style={{ fontSize:11, color:C.orange, fontFamily:"'IBM Plex Mono',monospace" }}>Gain: {fmtD(gain, true)}</div>}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Mgmt Fee %"><Input value={a.mgmtFee||0} onChange={e => upd("mgmtFee", Number(e.target.value))} type="number" /></Field>
        <Field label="Perf Fee %"><Input value={a.perfFee||0} onChange={e => upd("perfFee", Number(e.target.value))} type="number" /></Field>
      </div>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {"Layer 2: Tax (Recognized % of NAV)"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Field label="Ordinary %"><Input value={a.ordPct||0} onChange={e => upd("ordPct", Number(e.target.value))} type="number" /></Field>
        <Field label="STCG %"><Input value={a.stcgPct||0} onChange={e => upd("stcgPct", Number(e.target.value))} type="number" /></Field>
        <Field label="LTCG %"><Input value={a.ltcgPct||0} onChange={e => upd("ltcgPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Qual Div %"><Input value={a.qualDivPct||0} onChange={e => upd("qualDivPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Interest %"><Input value={a.intPct||0} onChange={e => upd("intPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Tax-Exempt %"><Input value={a.taxExPct||0} onChange={e => upd("taxExPct", Number(e.target.value))} type="number" /></Field>
      </div>
      <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
        <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim }}>
          <span>{"NAV Return"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace" }}>{(a.totalReturnPct||0).toFixed(1)}%</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim, marginTop:3 }}>
          <span>{"Recognized"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace", color:recogNet>=0?C.text:C.green }}>{recogNet.toFixed(1)}%</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim, marginTop:3 }}>
          <span>{"Gap (unrealized)"}</span><span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.orange }}>{((a.totalReturnPct||0)-recogNet).toFixed(1)}%</span>
        </div>
      </div>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {"Layer 3: Cash Flow"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Distribution % NAV"><Input value={a.distPct||0} onChange={e => upd("distPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Cap Call % Unfunded"><Input value={a.capCallPct||0} onChange={e => upd("capCallPct", Number(e.target.value))} type="number" /></Field>
      </div>
    </>}

    {/* Real Estate */}
    {a.assetType==="realEstate" && <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Fair Market Value"><Input value={a.value||0} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis||0} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      <Field label="Mortgage Balance"><Input value={a.mortgage||0} onChange={e => upd("mortgage", Number(e.target.value))} type="number" prefix="$" /></Field>
      {gain > 0 && <div style={{ fontSize:11, color:C.orange }}>{"Embedded gain: "}{fmtD(gain, true)}</div>}
    </>}

    {/* Retirement */}
    {a.assetType==="retirement" && <Field label="Balance">
      <Input value={a.value||0} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" />
    </Field>}

    <div style={{ display:"flex", gap:8, marginTop:8 }}>
      <Btn variant="gold" onClick={() => onSave(a)} style={{ flex:1 }}>Save Asset</Btn>
      {asset && <Btn variant="danger" onClick={() => onDelete(a.id)}>Delete</Btn>}
    </div>
  </div>;
}

// ─── OVERVIEW TAB ───────────────────────────────────────────────────────────
function OverviewTab({ profile, result, streams, assets, updProfile, bs }) {
  const kpis = [
    { label: "Net Worth", value: fmtD(bs.netWorth, true), sub: "All assets - liabilities", delta: `Liquid: ${fmtD(bs.liquidNW, true)}`, pos: bs.liquidNW > 0 },
    { label: "Gross Income (AGI)", value: fmtD(result.agi, true), sub: `${streams.length} streams + ${assets.length} positions`, delta: `Unfunded: ${fmtD(bs.totalUnfunded, true)}`, pos: null },
    { label: "Est. Total Tax", value: fmtD(result.totalTax, true), sub: `${pct(result.effectiveRate)} all-in eff. rate`, delta: `Fed: ${pct(result.marginalOrd)} marginal`, pos: null },
    { label: "Tax-Net Cash Flow", value: fmtD(result.netCashAfterTax, true), sub: "After all costs", delta: result.netCashAfterTax >= 0 ? "Positive" : "Deficit", pos: result.netCashAfterTax >= 0 },
  ];

  // Compute AQR-specific tax benefits (Delphi = ordinary, Flex = STCL - different mechanisms)
  const aqrOrdLoss = assets.filter(i => (i.assetType==="hedgeFund"||i.assetType==="peFund") && i.label && i.label.includes("Delphi")).reduce((t, i) => {
    const loss = (i.nav||0) * (i.ordPct||0) / 100;
    return t + (loss < 0 ? Math.abs(loss) : 0);
  }, 0);
  const aqrSTCL = assets.filter(i => (i.assetType==="hedgeFund"||i.assetType==="peFund") && i.label && i.label.includes("Flex")).reduce((t, i) => {
    const loss = (i.nav||0) * (i.stcgPct||0) / 100;
    return t + (loss < 0 ? Math.abs(loss) : 0);
  }, 0);
  const delphiBenefit = aqrOrdLoss * (result.marginalOrd/100 + (profile.stateRate||0)/100*0.88);
  const flexBenefit = aqrSTCL * ((result.marginalPref+3.8)/100 + (profile.stateRate||0)/100*0.88);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Profile editor row */}
    <Card style={{ padding: "16px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
        <Field label="Household Name">
          <Input value={profile.name} onChange={e => updProfile("name", e.target.value)} placeholder="Test Family" />
        </Field>
        <Field label="Filing Status">
          <Select value={profile.filingStatus} onChange={e => updProfile("filingStatus", e.target.value)}
            options={[{ value: "mfj", label: "MFJ" }, { value: "single", label: "Single" }, { value: "mfs", label: "MFS" }]} />
        </Field>
        <Field label="State">
          <Select value={profile.state} onChange={e => { updProfile("state", e.target.value); updProfile("stateRate", STATE_RATES[e.target.value]?.rate || 0); }}
            options={Object.entries(STATE_RATES).map(([k, v]) => ({ value: k, label: v.label }))} />
        </Field>
        <Field label="Monthly Living Exp.">
          <Input value={profile.livingExpenses} onChange={e => updProfile("livingExpenses", Number(e.target.value))} type="number" prefix="$" />
        </Field>
        <Field label="Monthly Debt Svc.">
          <Input value={profile.debtService} onChange={e => updProfile("debtService", Number(e.target.value))} type="number" prefix="$" />
        </Field>
      </div>
    </Card>

    {/* KPI Row */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {kpis.map((kpi, i) => (
        <Card key={i} style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.textMuted, marginBottom: 10 }}>{kpi.label}</div>
          <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: "-0.02em", marginBottom: 4 }}>{kpi.value}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{kpi.sub}</div>
          <div style={{ fontSize: 10, color: kpi.pos === true ? C.green : kpi.pos === false ? C.red : C.accent }}>{kpi.delta}</div>
        </Card>
      ))}
    </div>

    {/* AQR Tax-Aware: Delphi (ordinary loss) vs Flex (STCL) */}
    {(delphiBenefit > 0 || flexBenefit > 0) && <div style={{ display: "grid", gridTemplateColumns: delphiBenefit > 0 && flexBenefit > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
      {delphiBenefit > 0 && <Card style={{ padding: "16px 20px", background: C.green + "08", borderColor: C.green + "30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.green, marginBottom: 6 }}>{"Delphi Plus - Ordinary Loss Offset"}</div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
              {fmtD(aqrOrdLoss, true)} ordinary losses from NPC trades offset earned income at {pct(result.marginalOrd)} federal + {profile.stateRate}% state.
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
            <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 28, color: C.green, fontWeight: 600 }}>{fmtD(delphiBenefit, true)}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>tax savings</div>
          </div>
        </div>
      </Card>}
      {flexBenefit > 0 && <Card style={{ padding: "16px 20px", background: C.cyan + "08", borderColor: C.cyan + "30" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.cyan, marginBottom: 6 }}>{"Flex SMA - STCL Capital Gain Offset"}</div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
              {fmtD(aqrSTCL, true)} STCL offsets capital gains at {pct(result.marginalPref)}+3.8% NIIT rate (not ordinary income - $3K/yr cap).
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
            <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 28, color: C.cyan, fontWeight: 600 }}>{fmtD(flexBenefit, true)}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>tax savings</div>
          </div>
        </div>
      </Card>}
    </div>}

    {/* Schedule D Netting Summary */}
    {(result.netST !== 0 || result.netLT !== 0) && <Card style={{ padding: "14px 18px" }}>
      <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, marginBottom: 10 }}>{"Schedule D Capital Gain Netting"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          {l:"Gross ST", v:result.netST, c:result.netST>=0?C.orange:C.green},
          {l:"Gross LT", v:result.netLT, c:result.netLT>=0?C.green:C.red},
          {l:"After Netting: ST", v:result.netSTAfter, c:result.netSTAfter>0?C.orange:C.textDim},
          {l:"After Netting: LT", v:result.netLTAfter, c:result.netLTAfter>0?C.green:C.textDim},
        ].map((x,i) => (
          <div key={i}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{x.l}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: x.c }}>{fmtD(x.v, true)}</div>
          </div>
        ))}
      </div>
      {result.capitalLossCarry > 0 && <div style={{ fontSize: 10, color: C.orange, marginTop: 8 }}>
        Capital loss carryforward: {fmtD(result.capitalLossCarry, true)} (usable next year)
      </div>}
    </Card>}

    {/* Tax Breakdown + Bracket Fill */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Card style={{ padding: "20px 24px" }}>
        <SectionHeader sub="Character-separated tax computation">Tax Liability Stack</SectionHeader>
        {[
          { label: "Ordinary Tax", value: result.ordTax, color: C.blue, detail: `on ${fmtD(result.taxableOrd, true)} taxable` },
          { label: "LTCG / Qual Div Tax", value: result.ltcgTax, color: C.green, detail: `on ${fmtD(result.taxableLTCG, true)}` },
          { label: "NIIT (3.8%)", value: result.niit, color: C.orange, detail: `NII: ${fmtD(result.nii, true)}` },
          { label: "State Tax", value: result.stateTax, color: C.purple, detail: `${profile.state} @ ${profile.stateRate}%` },
        ].map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ width: 3, height: 24, borderRadius: 2, background: row.color, marginRight: 12 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.text }}>{row.label}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{row.detail}</div>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: C.text }}>{fmtD(row.value, true)}</div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${C.borderLight}`, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>Total Tax Liability</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: C.accent, fontWeight: 600 }}>{fmtD(result.totalTax, true)}</span>
        </div>
      </Card>

      <Card style={{ padding: "20px 24px" }}>
        <SectionHeader sub="Deduction method and QBI impact">Deduction Summary</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: C.textDim }}>Standard Deduction</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: result.useItemized ? C.textMuted : C.green }}>{fmtD(TAX_PARAMS[profile.filingStatus]?.std || 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: C.textDim }}>Itemized Total</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: result.useItemized ? C.green : C.textMuted }}>{fmtD(result.itemizedRaw)}</span>
          </div>
          <div style={{ background: C.surface2, borderRadius: 4, padding: "8px 12px", fontSize: 11 }}>
            <Badge color={result.useItemized ? C.green : C.blue}>{result.useItemized ? "Itemizing" : "Standard Deduction"}</Badge>
            <span style={{ marginLeft: 8, color: C.textDim }}>Using {fmtD(result.deductionAmt - result.qbiDeduction)}</span>
          </div>
          {result.qbiDeduction > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.textDim }}>§199A QBI Deduction</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.green }}>{fmtD(result.qbiDeduction)}</span>
          </div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8, borderTop: `1px solid ${C.borderLight}` }}>
            <span style={{ color: C.accent }}>Total Deductions</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.accent, fontWeight: 600 }}>{fmtD(result.deductionAmt)}</span>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <SectionHeader sub="Federal marginal rate by character">Marginal Rates</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: C.surface2, borderRadius: 6, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Ordinary</div>
              <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 28, color: C.blue, fontWeight: 600 }}>{pct(result.marginalOrd)}</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 6, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>LTCG / Qual Div</div>
              <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 28, color: C.green, fontWeight: 600 }}>{pct(result.marginalLTCG)}</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>;
}

// ─── INCOME TAB ─────────────────────────────────────────────────────────────
function IncomeTab({ streams, assets, onEdit, onAdd, onDelete }) {
  // Stream-only totals
  const totalOrd = streams.filter(s => {const c=INCOME_TYPES[s.type]?.char; return c==="ordEarned"||c==="ordInv";}).reduce((t, s) => t + s.amount, 0);
  const totalSTCG = streams.filter(s => INCOME_TYPES[s.type]?.char === "stcg").reduce((t, s) => t + s.amount, 0);
  const totalLTCG = streams.filter(s => {const c=INCOME_TYPES[s.type]?.char; return c==="ltcg"||c==="qualDiv";}).reduce((t, s) => t + s.amount, 0);
  const totalPassive = streams.filter(s => INCOME_TYPES[s.type]?.char === "passive").reduce((t, s) => t + s.amount, 0);

  // Asset-derived income
  const assetIncome = (assets||[]).map(a => {
    const at = a.assetType;
    const items = [];
    if (at==="cash" && (a.yieldPct||0)>0) {
      items.push({label:a.label, char:"ordInv", charLabel:"Interest", amount:(a.value||0)*(a.yieldPct||0)/100, detail:`${a.yieldPct}% yield on ${fmtD(a.value||0,true)}`});
    } else if (at==="security") {
      if ((a.divYieldPct||0)>0) items.push({label:a.label, char:"qualDiv", charLabel:"Qual. Dividends", amount:(a.value||0)*(a.divYieldPct||0)/100, detail:`${a.divYieldPct}% yield`});
      if ((a.realizedGainPct||0)!==0) items.push({label:a.label, char:"ltcg", charLabel:"Realized LTCG", amount:(a.value||0)*(a.realizedGainPct||0)/100, detail:`${a.realizedGainPct}% realized`});
    } else if (at==="hedgeFund"||at==="peFund") {
      const nav=a.nav||0;
      const ord=nav*(a.ordPct||0)/100 + nav*(a.intPct||0)/100;
      const st=nav*(a.stcgPct||0)/100;
      const lt=nav*(a.ltcgPct||0)/100;
      const qd=nav*(a.qualDivPct||0)/100;
      const te=nav*(a.taxExPct||0)/100;
      if (ord!==0) items.push({label:a.label, char:"ordInv", charLabel:"Ordinary", amount:ord, detail:`${a.ordPct||0}% ord + ${a.intPct||0}% int`});
      if (st!==0) items.push({label:a.label, char:"stcg", charLabel:"STCG", amount:st, detail:`${a.stcgPct}%`});
      if (lt!==0) items.push({label:a.label, char:"ltcg", charLabel:"LTCG", amount:lt, detail:`${a.ltcgPct}%`});
      if (qd!==0) items.push({label:a.label, char:"qualDiv", charLabel:"Qual. Div", amount:qd, detail:`${a.qualDivPct}%`});
      if (te!==0) items.push({label:a.label, char:"taxExempt", charLabel:"Tax-Exempt", amount:te, detail:`${a.taxExPct}%`});
    }
    return items;
  }).flat();

  const assetOrdInv = assetIncome.filter(i=>i.char==="ordInv").reduce((t,i)=>t+i.amount,0);
  const assetSTCG = assetIncome.filter(i=>i.char==="stcg").reduce((t,i)=>t+i.amount,0);
  const assetLTCG = assetIncome.filter(i=>i.char==="ltcg"||i.char==="qualDiv").reduce((t,i)=>t+i.amount,0);
  const assetTaxEx = assetIncome.filter(i=>i.char==="taxExempt").reduce((t,i)=>t+i.amount,0);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <SectionHeader sub={`${streams.length} streams + ${assetIncome.length} asset-derived items`}>{"Income Registry"}</SectionHeader>
      <Btn variant="gold" onClick={onAdd}>{"+ Add Income"}</Btn>
    </div>
    {/* Combined summary badges */}
    <div style={{ display: "flex", gap: 12 }}>
      {[
        {l:"Ordinary",v:totalOrd+assetOrdInv,c:C.blue},
        {l:"STCG",v:totalSTCG+assetSTCG,c:C.orange},
        {l:"LTCG / QDiv",v:totalLTCG+assetLTCG,c:C.green},
        {l:"Passive",v:totalPassive,c:C.purple},
        ...(assetTaxEx!==0?[{l:"Tax-Exempt",v:assetTaxEx,c:C.teal}]:[]),
      ].map((x,i) => (
        <Card key={i} style={{ padding:"14px 18px", flex:1 }}>
          <div style={{ fontSize:9, color:C.textMuted, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:6 }}>{x.l}</div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:18, color:x.c }}>{fmtD(x.v, true)}</div>
        </Card>
      ))}
    </div>
    {/* Earned / standalone streams */}
    <SectionHeader sub="Earned income, partnership allocations, and other non-asset income">{"Income Streams"}</SectionHeader>
    {streams.length === 0 && <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>No income streams configured. Add W-2, K-1, rental, or other income sources.</div>
    </Card>}
    {streams.map(s => {
      const t = INCOME_TYPES[s.type];
      const wPct = (s.fedWithholdingPct||0)+(s.stateWithholdingPct||0);
      const netAmt = (s.amount||0) * (1 - wPct/100);
      return <Card key={s.id} style={{ padding: "14px 18px", cursor: "pointer", transition: "border-color .15s" }}
        onClick={() => onEdit(s)}
        onMouseOver={e => e.currentTarget.style.borderColor = C.accent + "40"}
        onMouseOut={e => e.currentTarget.style.borderColor = C.border}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 36, borderRadius: 2, background: t?.color || C.textMuted }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>{s.label || t?.label}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Badge color={t?.color}>{CHARS[t?.char]?.short || t?.char}</Badge>
              <Badge color={C.textDim}>{s.timing}</Badge>
              {wPct > 0 && <Badge color={C.orange}>{wPct.toFixed(0)}% W/H</Badge>}
              {s.pteElection && <Badge color={C.purple}>PTE</Badge>}
              {s.qbi && <Badge color={C.teal}>QBI</Badge>}
              <span style={{ fontSize: 10, color: C.textMuted }}>{s.entity}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: C.text }}>{fmtD(s.amount, true)}</div>
            {wPct > 0 && <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: C.green }}>net: {fmtD(netAmt, true)}</div>}
            {wPct === 0 && <div style={{ fontSize: 10, color: C.textMuted }}>/yr</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 8, flexShrink: 0 }}>
            <Btn variant="ghost" onClick={e => { e.stopPropagation(); onEdit(s); }} style={{ fontSize: 10, padding: "3px 8px" }}>Edit</Btn>
            <Btn variant="ghost" onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ fontSize: 10, padding: "3px 8px", color: C.red }}>x</Btn>
          </div>
        </div>
      </Card>;
    })}
    {/* Asset-derived income */}
    <SectionHeader sub="Income generated by balance sheet assets (edit on Balance Sheet tab)">{"Asset-Derived Income"}</SectionHeader>
    <Card style={{ padding:"16px 20px" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${C.borderLight}` }}>
            {["Source","Character","Detail","Annual"].map(h =>
              <th key={h} style={{ textAlign:h==="Annual"?"right":"left", padding:"6px 4px", fontSize:8, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:400 }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {assetIncome.map((item,i) => (
            <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.surface2:"transparent" }}>
              <td style={{ padding:"7px 4px", color:C.text, fontSize:11 }}>{item.label}</td>
              <td style={{ padding:"7px 4px" }}><Badge color={CHARS[item.char]?.color||C.textDim}>{item.charLabel}</Badge></td>
              <td style={{ padding:"7px 4px", color:C.textDim, fontSize:10 }}>{item.detail}</td>
              <td style={{ padding:"7px 4px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", color:item.amount>=0?C.text:C.green }}>{fmtD(item.amount, true)}</td>
            </tr>
          ))}
          {assetIncome.length === 0 && <tr><td colSpan={4} style={{ padding:20, textAlign:"center", color:C.textMuted }}>No asset-derived income. Add yields on Balance Sheet tab.</td></tr>}
          <tr style={{ borderTop:`2px solid ${C.border}` }}>
            <td colSpan={3} style={{ padding:"8px 4px", fontSize:12, color:C.text, fontWeight:500 }}>{"Total Asset-Derived"}</td>
            <td style={{ padding:"8px 4px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:C.accent }}>
              {fmtD(assetIncome.reduce((t,i)=>t+i.amount,0), true)}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>;
}

// Tier/type lookup tables for unified assets
const TIER_INFO = [
  {key:"1",label:"Tier 1: Cash",color:C.green},
  {key:"2",label:"Tier 2: Liquid Securities",color:C.blue},
  {key:"3",label:"Tier 3: Semi-Liquid (HF/SMA)",color:C.purple},
  {key:"4",label:"Tier 4: Illiquid (PE/RE)",color:C.orange},
  {key:"R",label:"Retirement",color:C.textDim},
];
const ASSET_TIER = {cash:"1",security:"2",hedgeFund:"3",peFund:"4",realEstate:"4",retirement:"R"};
const ASSET_LABELS = {cash:"Cash",security:"Securities",hedgeFund:"Hedge Fund",peFund:"PE/VC Fund",realEstate:"Real Estate",retirement:"Retirement"};

function BalanceSheetTab({ assets, bs, onEdit, onAdd, onDelete }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <SectionHeader sub={`${assets.length} positions`}>{"Balance Sheet"}</SectionHeader>
      <Btn variant="gold" onClick={onAdd}>{"+ Add Asset"}</Btn>
    </div>
    {/* KPIs */}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10 }}>
      {[
        {l:"Total Assets",v:bs.totalAssets,c:C.text},
        {l:"Liabilities",v:bs.totalLiabilities,c:C.red},
        {l:"Net Worth",v:bs.netWorth,c:C.gold},
        {l:"Liquid NW",v:bs.liquidNW,c:bs.liquidNW>0?C.green:C.red},
        {l:"Unfunded",v:bs.totalUnfunded,c:C.orange},
      ].map((k,i) => (
        <Card key={i} style={{ padding:"12px 14px" }}>
          <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:5 }}>{k.l}</div>
          <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:20, color:k.c, fontWeight:600 }}>{fmtD(k.v, true)}</div>
        </Card>
      ))}
    </div>
    {/* Tier bars */}
    <Card style={{ padding:"16px 20px" }}>
      <SectionHeader sub="By liquidity tier">{"Allocation"}</SectionHeader>
      {TIER_INFO.map(t => {
        const v = bs.tiers[t.key]||0;
        if (v <= 0) return null;
        const pctW = bs.totalAssets > 0 ? (v/bs.totalAssets)*100 : 0;
        return <div key={t.key} style={{ marginBottom:6 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:2 }}>
            <span style={{ color:C.textDim }}>{t.label}</span>
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:t.color }}>{fmtD(v, true)} ({pctW.toFixed(0)}%)</span>
          </div>
          <div style={{ height:5, background:C.surface3, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pctW}%`, background:t.color, borderRadius:3 }} />
          </div>
        </div>;
      })}
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8, marginTop:6, display:"flex", justifyContent:"space-between", fontSize:11 }}>
        <span style={{ color:C.textDim }}>{"Embedded Unrealized Gain"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.orange }}>{fmtD(bs.totalEmbeddedGain, true)}</span>
      </div>
    </Card>
    {/* Asset list grouped by tier */}
    {TIER_INFO.map(tier => {
      const tierAssets = assets.filter(a => ASSET_TIER[a.assetType] === tier.key);
      if (tierAssets.length === 0) return null;
      return <div key={tier.key}>
        <div style={{ fontSize:10, color:tier.color, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6, marginTop:4 }}>{tier.label}</div>
        {tierAssets.map(a => {
          const isFund = a.assetType==="hedgeFund"||a.assetType==="peFund";
          const val = isFund ? (a.nav||0) : (a.value||0);
          const basis = isFund ? (a.adjBasis||a.costBasis||0) : (a.costBasis||val);
          const gain = val - basis;
          const recog = isFund ? ((a.ordPct||0)+(a.stcgPct||0)+(a.ltcgPct||0)+(a.qualDivPct||0)+(a.intPct||0)+(a.taxExPct||0)) : 0;
          const annualIncome = a.assetType==="cash" ? (a.value||0)*(a.yieldPct||0)/100
            : a.assetType==="security" ? (a.value||0)*((a.divYieldPct||0)+(a.realizedGainPct||0))/100
            : isFund ? val*recog/100 : 0;
          return (
            <Card key={a.id} style={{ padding:"12px 16px", cursor:"pointer", marginBottom:4 }}
              onClick={() => onEdit(a)}
              onMouseOver={e => {e.currentTarget.style.borderColor=tier.color+"60";}}
              onMouseOut={e => {e.currentTarget.style.borderColor=C.border;}}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Badge color={tier.color}>{ASSET_LABELS[a.assetType]||a.assetType}</Badge>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:C.text }}>{a.label}</div>
                  <div style={{ display:"flex", gap:6, marginTop:2, flexWrap:"wrap" }}>
                    {a.assetType==="cash" && (a.yieldPct||0)>0 && <Badge color={C.cyan}>{a.yieldPct}% yield</Badge>}
                    {a.assetType==="security" && (a.divYieldPct||0)>0 && <Badge color={C.green}>{a.divYieldPct}% div</Badge>}
                    {isFund && recog!==0 && <Badge color={recog>=0?C.text:C.green}>{recog.toFixed(1)}% recog</Badge>}
                    {isFund && (a.totalReturnPct||0)>0 && <Badge color={C.textDim}>{a.totalReturnPct}% return</Badge>}
                    {(a.unfunded||0)>0 && <Badge color={C.orange}>{fmtD(a.unfunded,true)} unfunded</Badge>}
                    <span style={{ fontSize:10, color:C.textMuted }}>{a.entity}</span>
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:C.text }}>{fmtD(val, true)}</div>
                  {annualIncome!==0 && <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:annualIncome>0?C.cyan:C.green }}>{fmtD(annualIncome, true)}/yr</div>}
                  {gain!==0 && basis>0 && basis!==val && <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:gain>0?C.orange:C.green }}>{fmtD(gain, true)} gain</div>}
                  {(a.mortgage||0)>0 && <div style={{ fontSize:10, color:C.red }}>{"Mtg: "}{fmtD(a.mortgage, true)}</div>}
                </div>
                <Btn variant="ghost" onClick={e => { e.stopPropagation(); onDelete(a.id); }} style={{ fontSize:10, padding:"3px 8px", color:C.red }}>{"x"}</Btn>
              </div>
            </Card>
          );
        })}
      </div>;
    })}
  </div>;
}

// ─── DEDUCTIONS TAB ─────────────────────────────────────────────────────────
function DeductionsTab({ deductions, setDeductions, profile, updProfile, result }) {
  const addDed = (type) => setDeductions(prev => [...prev, { id: uid(), type, amount: 0, label: "" }]);
  const updDed = (id, k, v) => setDeductions(prev => prev.map(d => d.id === id ? { ...d, [k]: v } : d));
  const delDed = (id) => setDeductions(prev => prev.filter(d => d.id !== id));

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <SectionHeader sub="Itemized deductions and prior year safe harbor inputs">{"Deductions & Prior Year"}</SectionHeader>
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>Prior Year (for Safe Harbor)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Prior Year Tax Liability">
          <Input value={profile.priorYearLiability} onChange={e => updProfile("priorYearLiability", Number(e.target.value))} type="number" prefix="$" />
        </Field>
        <Field label="Prior Year AGI">
          <Input value={profile.priorYearAgi} onChange={e => updProfile("priorYearAgi", Number(e.target.value))} type="number" prefix="$" />
        </Field>
      </div>
    </Card>
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase" }}>Itemized Deductions</div>
        <div style={{ display: "flex", gap: 4 }}>
          {DEDUCTION_TYPES.map(dt => (
            <Btn key={dt.id} variant="ghost" onClick={() => addDed(dt.id)}
              style={{ fontSize: 9, border: `1px solid ${C.border}`, borderRadius: 3 }}>+ {dt.label.split("(")[0].trim()}</Btn>
          ))}
        </div>
      </div>
      {deductions.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 12 }}>No deductions added. Use buttons above to add.</div>}
      {deductions.map(d => {
        const dt = DEDUCTION_TYPES.find(t => t.id === d.type);
        return <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, fontSize: 12, color: C.textDim }}>{dt?.label || d.type}</div>
          <Input value={d.amount} onChange={e => updDed(d.id, "amount", Number(e.target.value))} type="number" prefix="$" style={{ width: 120 }} />
          {dt?.max && d.amount > dt.max && <Badge color={C.red}>Capped at ${fmt(dt.max)}</Badge>}
          <Btn variant="ghost" onClick={() => delDed(d.id)} style={{ color: C.red }}>✕</Btn>
        </div>;
      })}
    </Card>
  </div>;
}

// ─── CASH FLOW TAB ──────────────────────────────────────────────────────────

function CashFlowTab({ profile, streams, result }) {
  const monthly = useMemo(() => computeMonthlyCashflow(profile, streams, [], result), [profile, streams, result]);
  const maxVal = Math.max(1, ...monthly.map(m => Math.max(m.grossIn, m.estPmt+m.livingExp+m.debtSvc+m.capCall+m.withholding)));
  const barH = 140;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <SectionHeader sub="Gross income -> withholding -> net deposit -> outflows">{"12-Month Cash Flow"}</SectionHeader>
    {/* Annual summary */}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10 }}>
      {[
        {l:"Gross Income",v:monthly.reduce((t,m)=>t+m.grossIn,0),c:C.text},
        {l:"Withholding",v:result.totalWithholding,c:C.orange},
        {l:"Est. Tax Pmts",v:result.totalEstPaid,c:C.red},
        {l:"Net Deposits",v:monthly.reduce((t,m)=>t+m.cashIn,0),c:C.green},
        {l:"Year-End Cum.",v:monthly[11]?.cumulative||0,c:(monthly[11]?.cumulative||0)>=0?C.green:C.red},
      ].map((x,i) => (
        <Card key={i} style={{ padding:"12px 14px" }}>
          <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:4 }}>{x.l}</div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:14, color:x.c }}>{fmtD(x.v, true)}</div>
        </Card>
      ))}
    </div>
    {/* Bar chart */}
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[{l:"Net Deposit",c:C.green},{l:"Withholding",c:C.orange},{l:"Est. Tax",c:C.red},{l:"Living+Debt",c:C.textDim},{l:"Cap Calls",c:C.purple}]
          .map((x,i) => <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:C.textMuted }}>
            <div style={{ width:8, height:8, borderRadius:2, background:x.c }} />{x.l}
          </div>)}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: barH + 60 }}>
        {monthly.map((m, i) => {
          const incH = maxVal>0 ? (m.cashIn/maxVal)*barH : 0;
          const whH = maxVal>0 ? (m.withholding/maxVal)*barH : 0;
          const taxH = maxVal>0 ? (m.estPmt/maxVal)*barH : 0;
          const expH = maxVal>0 ? ((m.livingExp+m.debtSvc)/maxVal)*barH : 0;
          const capH = maxVal>0 ? (m.capCall/maxVal)*barH : 0;
          return <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            <div style={{ fontSize:9, color:m.net>=0?C.green:C.red, fontFamily:"'IBM Plex Mono',monospace" }}>
              {fmtD(m.net, true)}
            </div>
            <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:1 }}>
              <div style={{ height:incH, background:C.green+"88", borderRadius:"3px 3px 0 0", minHeight:incH>0?2:0 }} />
              <div style={{ height:whH, background:C.orange+"66", minHeight:whH>0?2:0 }} />
              <div style={{ height:taxH, background:C.red+"88", minHeight:taxH>0?2:0 }} />
              <div style={{ height:expH, background:C.textDim+"44", minHeight:expH>0?2:0 }} />
              <div style={{ height:capH, background:C.purple+"66", borderRadius:"0 0 3px 3px", minHeight:capH>0?2:0 }} />
            </div>
            <div style={{ fontSize:9, color:C.textMuted }}>{m.month}</div>
            <div style={{ fontSize:8, color:C.textDim, fontFamily:"'IBM Plex Mono',monospace" }}>{fmtD(m.cumulative, true)}</div>
          </div>;
        })}
      </div>
    </Card>

    {/* Detail table */}
    <Card style={{ padding: "20px 24px", overflowX: "auto" }}>
      <SectionHeader sub="Gross -> W/H -> Net In -> Outflows">{"Detail Schedule"}</SectionHeader>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
            {["Month","Gross In","W/H","Net In","Est. Tax","Living","Debt","Calls","Net","Cum."].map(h =>
              <th key={h} style={{ textAlign:h==="Month"?"left":"right", padding:"7px 4px", fontSize:8, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:400 }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {monthly.map((m,i) => (
            <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.surface2:"transparent" }}>
              <td style={{ padding:"6px 4px", color:C.text, fontSize:11 }}>{m.month}{m.qDue ? <span style={{ fontSize:8, color:C.red, marginLeft:3 }}>({m.qDue})</span> : ""}</td>
              {[m.grossIn, m.withholding, m.cashIn, m.estPmt, m.livingExp, m.debtSvc, m.capCall, m.net, m.cumulative].map((v,j) =>
                <td key={j} style={{ padding:"6px 4px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontSize:10.5,
                  color: j===1?C.orange : j>=7?(v>=0?C.green:C.red) : C.textDim }}>{fmtD(v)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  </div>;
}

// ─── ENTITY GRAPH TAB ───────────────────────────────────────────────────────
function EntitiesTab({ entities, setEntities }) {
  const [editing, setEditing] = useState(null);
  const addEntity = (preset) => {
    const e = { id: uid(), label: preset.label, type: preset.type, filing: preset.filing, color: preset.color, ownedBy: "", ownershipPct: 100, notes: "" };
    setEntities(prev => [...prev, e]);
    setEditing(e.id);
  };
  const updEntity = (id, k, v) => setEntities(prev => prev.map(e => e.id === id ? { ...e, [k]: v } : e));
  const delEntity = (id) => { setEntities(prev => prev.filter(e => e.id !== id)); setEditing(null); };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <SectionHeader sub="Ownership structure and filing unit resolution">Entity Graph</SectionHeader>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      {ENTITY_PRESETS.map((p, i) => (
        <Btn key={i} variant="ghost" onClick={() => addEntity(p)}
          style={{ fontSize: 10, border: `1px solid ${C.border}`, borderRadius: 3 }}>+ {p.label}</Btn>
      ))}
    </div>
    {entities.length === 0 && <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>No entities configured. Add individuals, trusts, LLCs, and partnerships to build the ownership graph.</div>
    </Card>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {entities.map(e => (
        <Card key={e.id} style={{ padding: "16px 18px", cursor: "pointer", borderColor: editing === e.id ? C.gold : C.border }}
          onClick={() => setEditing(editing === e.id ? null : e.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, marginTop: 4 }} />
            <Badge color={e.color}>{e.type}</Badge>
          </div>
          <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>{e.label}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{e.filing}</div>
          {e.ownedBy && <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
            Owned by: {entities.find(x => x.id === e.ownedBy)?.label || "—"} ({e.ownershipPct}%)
          </div>}
          {editing === e.id && <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }} onClick={ev => ev.stopPropagation()}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Name"><Input value={e.label} onChange={ev => updEntity(e.id, "label", ev.target.value)} /></Field>
              <Field label="Owned By">
                <Select value={e.ownedBy} onChange={ev => updEntity(e.id, "ownedBy", ev.target.value)}
                  options={[{ value: "", label: "— Top-level —" }, ...entities.filter(x => x.id !== e.id).map(x => ({ value: x.id, label: x.label }))]} />
              </Field>
              <Field label="Ownership %"><Input value={e.ownershipPct} onChange={ev => updEntity(e.id, "ownershipPct", Number(ev.target.value))} type="number" /></Field>
              <Field label="Notes"><Input value={e.notes} onChange={ev => updEntity(e.id, "notes", ev.target.value)} placeholder="Filing notes, EIN, etc." /></Field>
              <Btn variant="danger" onClick={() => delEntity(e.id)} style={{ marginTop: 4 }}>Delete Entity</Btn>
            </div>
          </div>}
        </Card>
      ))}
    </div>
  </div>;
}

// ─── ESTIMATED TAX TAB ──────────────────────────────────────────────────────
function EstTaxTab({ profile, updProfile, result, streams }) {
  const quarters = [
    { label:"Q1", due:"Apr 15, 2025", field:"q1Paid" },
    { label:"Q2", due:"Jun 15, 2025", field:"q2Paid" },
    { label:"Q3", due:"Sep 15, 2025", field:"q3Paid" },
    { label:"Q4", due:"Jan 15, 2026", field:"q4Paid" },
  ];
  const target = result.safeHarborTarget;
  const remaining = result.remainingSH;
  const unpaidQs = quarters.filter(q => !(profile[q.field]>0)).length;
  const suggestPerQ = unpaidQs > 0 ? Math.ceil(remaining / unpaidQs) : 0;
  const onTrack = remaining <= 0;

  // Streams with withholding
  const withheldStreams = streams.filter(s => (s.fedWithholdingPct||0)>0 || (s.stateWithholdingPct||0)>0);

  return <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <SectionHeader sub="Full tax payment waterfall: liability -> withholding -> estimates -> balance due">{"Tax Payment Optimizer"}</SectionHeader>

    {/* The Waterfall */}
    <Card style={{ padding:"20px 24px" }}>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>{"Federal Tax Waterfall"}</div>
      {[
        {l:"Federal Tax Liability",v:result.federalTax,c:C.red,bold:true},
        {l:"Less: Federal Withholding",v:-result.totalFedWithholding,c:C.green},
        {l:"Less: Estimated Tax Payments",v:-result.totalEstPaid,c:C.green},
        {l:"Total Prepaid",v:result.totalPrepaid,c:C.blue,sub:true},
        {l:result.balanceDueFed>0?"Balance Due":"Overpayment",v:result.balanceDueFed>0?result.balanceDueFed:-result.overpaymentFed,c:result.balanceDueFed>0?C.red:C.green,bold:true},
      ].map((row,i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:row.bold?"8px 0":"4px 0",
          borderTop:row.sub||row.bold?`1px solid ${C.border}`:"none", marginTop:row.sub||row.bold?6:0 }}>
          <span style={{ fontSize:row.bold?12:11, color:row.bold?C.text:C.textDim }}>{row.l}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:row.bold?14:12, color:row.c }}>{fmtD(row.v, true)}</span>
        </div>
      ))}
      <div style={{ borderTop:`1px solid ${C.border}`, marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, color:C.textDim }}>{"State Tax"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.red }}>{fmtD(result.stateTax, true)}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", paddingTop:2 }}>
        <span style={{ fontSize:11, color:C.textDim }}>{"Less: State Withholding"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.green }}>({fmtD(result.totalStateWithholding, true)})</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${C.border}`, paddingTop:6, marginTop:4 }}>
        <span style={{ fontSize:12, color:C.text }}>{"State Balance Due"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:14, color:result.balanceDueState>0?C.red:C.green }}>{fmtD(result.balanceDueState, true)}</span>
      </div>
    </Card>

    {/* Withholding Sources */}
    {withheldStreams.length > 0 && <Card style={{ padding:"16px 20px" }}>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>{"Withholding Sources"}</div>
      {withheldStreams.map(s => {
        const fedW = (s.amount||0)*(s.fedWithholdingPct||0)/100;
        const stW = (s.amount||0)*(s.stateWithholdingPct||0)/100;
        return <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.text }}>{s.label}</div>
            <div style={{ fontSize:10, color:C.textMuted }}>{fmtD(s.amount,true)} gross{s.pteElection?" (PTE election)":""}</div>
          </div>
          <div style={{ textAlign:"right", fontSize:11, fontFamily:"'IBM Plex Mono',monospace" }}>
            <div style={{ color:C.orange }}>Fed: {fmtD(fedW,true)} ({s.fedWithholdingPct}%)</div>
            {stW>0 && <div style={{ color:C.purple }}>State: {fmtD(stW,true)} ({s.stateWithholdingPct}%)</div>}
          </div>
        </div>;
      })}
    </Card>}

    {/* Safe Harbor */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
      <Card style={{ padding:"16px 18px" }}>
        <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"110% Prior Year"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:22, color:C.text }}>{fmtD(result.safeHarborPY, true)}</div>
      </Card>
      <Card style={{ padding:"16px 18px" }}>
        <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"90% Current Year"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:22, color:C.text }}>{fmtD(result.safeHarborCY, true)}</div>
      </Card>
      <Card style={{ padding:"16px 18px", borderColor:onTrack?C.green+"40":C.red+"40" }}>
        <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"Status"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:22, color:onTrack?C.green:C.red }}>{onTrack?"ON TRACK":"UNDERPAID"}</div>
        <div style={{ fontSize:10, color:C.textDim }}>{onTrack?"Withholding + estimates cover safe harbor":`${fmtD(remaining,true)} still needed`}</div>
      </Card>
    </div>

    {/* Quarterly Schedule */}
    <Card style={{ padding:"20px 24px" }}>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>{"Quarterly Estimated Payments (1040-ES)"}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
        {quarters.map((q,i) => {
          const paid = profile[q.field] || 0;
          return <div key={i} style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{q.label}</span>
              <span style={{ fontSize:10, color:C.textMuted }}>{q.due}</span>
            </div>
            <Field label="Paid">
              <Input value={paid} onChange={e => updProfile(q.field, Number(e.target.value))} type="number" prefix="$" />
            </Field>
          </div>;
        })}
      </div>
    </Card>

    {remaining > 0 && unpaidQs > 0 && <Card style={{ padding:"14px 18px", background:C.accent+"08", borderColor:C.accent+"30" }}>
      <div style={{ fontSize:11, color:C.textDim }}>
        {"Suggestion: pay "}{fmtD(suggestPerQ)}{" in each of the "}{unpaidQs}{" remaining quarters to meet safe harbor. Withholding already covers "}{fmtD(result.totalFedWithholding, true)}{" of the target."}
      </div>
    </Card>}
  </div>;
}

// ─── PRELOADED FAMILY: THE CALDWELLS ────────────────────────────────────────
// BigLaw partner, married, two kids, SF real estate, PE + AQR allocations
const PRELOAD_PROFILE = {
  name: "Test Family", filingStatus: "mfj", state: "CA", stateRate: 14.3,
  priorYearLiability: 1050000, priorYearAgi: 2900000,
  q1Paid: 275000, q2Paid: 275000, q3Paid: 0, q4Paid: 0,
  livingExpenses: 28000, debtService: 14000,
};

const PRELOAD_STREAMS = [
  { id:"s1", type:"k1_guaranteed", label:"K-1 Guaranteed Payment - Monthly Draw (BigLaw Test)", amount:300000, timing:"monthly", entity:"Husband", qbi:false,
    fedWithholdingPct:37, stateWithholdingPct:13.3, pteElection:true },
  { id:"s2", type:"k1_ordinary", label:"K-1 Ordinary - Quarterly Partner Distribution", amount:2200000, timing:"quarterly", entity:"Husband", qbi:false,
    fedWithholdingPct:0, stateWithholdingPct:0 },
  { id:"s3", type:"k1_ltcg", label:"K-1 LTCG - Firm Investment Account Gains", amount:600000, timing:"annual", timingMonth:2, entity:"Husband", qbi:false,
    fedWithholdingPct:0, stateWithholdingPct:0 },
  { id:"s4", type:"rental", label:"Net Rental Income - Pacific Heights Duplex", amount:72000, timing:"monthly", entity:"Test RE Holdings LLC", qbi:false,
    fedWithholdingPct:0, stateWithholdingPct:0 },
];

const PRELOAD_ASSETS = [
  // Cash (Tier 1)
  {id:"a1",assetType:"cash",label:"Schwab Checking + Money Market",value:920000,yieldPct:4.8,entity:"Husband"},
  {id:"a2",assetType:"cash",label:"Operating Cash - RE LLC",value:45000,yieldPct:0,entity:"Test RE Holdings LLC"},
  // Securities (Tier 2)
  {id:"a3",assetType:"security",label:"Direct Equity Portfolio (Schwab)",value:1800000,costBasis:1200000,divYieldPct:1.4,realizedGainPct:0,entity:"Test Family Trust"},
  // Hedge Funds (Tier 3)
  {id:"a4",assetType:"hedgeFund",label:"AQR Tax-Aware Delphi Plus Fund",nav:5400000,costBasis:4900000,adjBasis:4500000,unfunded:0,
    totalReturnPct:12,mgmtFee:2.0,perfFee:20,ordPct:-30,stcgPct:0,ltcgPct:25,qualDivPct:5,intPct:0,taxExPct:0,
    distPct:0,capCallPct:0,entity:"Test Family Trust"},
  {id:"a5",assetType:"hedgeFund",label:"AQR Flex SMA (F250)",nav:3000000,costBasis:2800000,adjBasis:2800000,unfunded:0,
    totalReturnPct:10,mgmtFee:0.55,perfFee:0,ordPct:0,stcgPct:-50,ltcgPct:0,qualDivPct:1,intPct:0,taxExPct:0,
    distPct:0,capCallPct:0,entity:"Husband"},
  // PE Funds (Tier 4)
  {id:"a6",assetType:"peFund",label:"Silver Lake Partners VII (Buyout)",nav:2500000,costBasis:2000000,adjBasis:1850000,unfunded:500000,
    totalReturnPct:18,mgmtFee:2.0,perfFee:20,ordPct:-2,stcgPct:0,ltcgPct:8,qualDivPct:0,intPct:0,taxExPct:0,
    distPct:12,capCallPct:20,entity:"Test Family Trust"},
  {id:"a7",assetType:"peFund",label:"TCV XI (Growth Equity)",nav:1500000,costBasis:1200000,adjBasis:1125000,unfunded:375000,
    totalReturnPct:22,mgmtFee:2.0,perfFee:20,ordPct:-1,stcgPct:0,ltcgPct:5,qualDivPct:0,intPct:0,taxExPct:0,
    distPct:8,capCallPct:25,entity:"Test Family Trust"},
  // Real Estate (Tier 4)
  {id:"a8",assetType:"realEstate",label:"Pacific Heights Duplex",value:3500000,costBasis:2200000,mortgage:1400000,entity:"Test RE Holdings LLC"},
  // Retirement (Tier R)
  {id:"a9",assetType:"retirement",label:"Husband 401(k) / Profit-Sharing",value:1200000,entity:"Husband"},
  {id:"a10",assetType:"retirement",label:"Wife IRA (Rollover)",value:380000,entity:"Wife"},
];

const PRELOAD_DEDUCTIONS = [
  { id: "d1", type: "salt", amount: 10000, label: "SALT (CA - capped)" },
  { id: "d2", type: "mortgage", amount: 72000, label: "Mortgage Interest - Pacific Heights" },
  { id: "d3", type: "charitable", amount: 40000, label: "Annual Charitable (DAF + Direct)" },
];

const PRELOAD_ENTITIES = [
  { id: "e1", label: "Husband", type: "individual", filing: "1040 (MFJ)", color: C.gold, ownedBy: "", ownershipPct: 100, notes: "Partner, BigLaw Test LLP - San Francisco office" },
  { id: "e2", label: "Wife", type: "individual", filing: "1040 (MFJ)", color: C.blue, ownedBy: "", ownershipPct: 100, notes: "Spouse" },
  { id: "e3", label: "Test Family Trust", type: "revTrust", filing: "Grantor -> 1040", color: C.purple, ownedBy: "", ownershipPct: 100, notes: "Joint revocable trust - holds PE + Delphi Plus allocations" },
  { id: "e4", label: "Test RE Holdings LLC", type: "llcDisregard", filing: "Sch E -> 1040", color: C.teal, ownedBy: "e3", ownershipPct: 100, notes: "Holds Pacific Heights duplex - disregarded entity" },
];

// ─── PERSONA PRESETS ────────────────────────────────────────────────────────
const PERSONA_PRESETS = [
  {
    label: "BigLaw Partner", desc: "Senior partner at Am Law 100 firm",
    profile: { filingStatus: "mfj", state: "NY", stateRate: 10.9, livingExpenses: 25000, debtService: 8000 },
    streams: [
      { type: "k1_guaranteed", label: "Guaranteed Payment — Partner Draw", amount: 1200000, timing: "monthly", entity: "Firm LLP", qbi: false },
      { type: "k1_ordinary", label: "K-1 Ordinary — Firm Profit Allocation", amount: 800000, timing: "annual", timingMonth: 2, entity: "Firm LLP", qbi: true },
      { type: "k1_ltcg", label: "K-1 LTCG — Firm Investment Gains", amount: 150000, timing: "annual", timingMonth: 2, entity: "Firm LLP", qbi: false },
    ],
  },
  {
    label: "PE Fund GP", desc: "General Partner at mid-market PE firm",
    profile: { filingStatus: "mfj", state: "NY", stateRate: 10.9, livingExpenses: 35000, debtService: 15000 },
    streams: [
      { type: "w2", label: "W-2 Salary — Management Company", amount: 400000, timing: "monthly", entity: "Fund Mgmt Co", qbi: false },
      { type: "k1_guaranteed", label: "GP Mgmt Fee Share", amount: 600000, timing: "quarterly", entity: "Fund GP LLC", qbi: false },
      { type: "k1_ltcg", label: "Carried Interest — Fund III", amount: 2000000, timing: "annual", timingMonth: 2, entity: "Fund III GP LLC", qbi: false },
      { type: "k1_ordinary", label: "Monitoring Fee Income", amount: 200000, timing: "semi", entity: "Fund III GP LLC", qbi: false },
    ],
  },
  {
    label: "HF Portfolio Manager", desc: "Senior PM at multi-strat hedge fund",
    profile: { filingStatus: "mfj", state: "CT", stateRate: 6.99, livingExpenses: 30000, debtService: 12000 },
    streams: [
      { type: "w2", label: "W-2 Base + Guaranteed Comp", amount: 500000, timing: "monthly", entity: "Fund Management LLC", qbi: false },
      { type: "k1_ordinary", label: "K-1 Ordinary — Fund P&L Allocation", amount: 1500000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
      { type: "k1_stcg", label: "K-1 STCG — Trading Gains", amount: 800000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
      { type: "k1_ltcg", label: "K-1 LTCG — Longer-Dated Positions", amount: 400000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
    ],
  },
  {
    label: "Real Estate Family", desc: "Multi-property rental portfolio",
    profile: { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 20000, debtService: 18000 },
    streams: [
      { type: "rental", label: "Rental Net — Portfolio (8 units)", amount: 320000, timing: "monthly", entity: "RE Holdings LLC", qbi: true },
      { type: "k1_1250", label: "Sec. 1250 Recapture — Property Sale", amount: 180000, timing: "annual", timingMonth: 5, entity: "RE Holdings LLC", qbi: false },
      { type: "interest", label: "Money Market / T-Bills", amount: 120000, timing: "monthly", entity: "Direct", qbi: false },
      { type: "qual_div", label: "REIT Qualified Dividends", amount: 45000, timing: "quarterly", entity: "Brokerage", qbi: false },
    ],
  },
];

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function YosemitePlatform() {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(PRELOAD_PROFILE);
  const [streams, setStreams] = useState(PRELOAD_STREAMS);
  const [assets, setAssets] = useState(PRELOAD_ASSETS);
  const [deductions, setDeds] = useState(PRELOAD_DEDUCTIONS);
  const [entities, setEntities] = useState(PRELOAD_ENTITIES);
  const [panel, setPanel] = useState(null);

  const updProfile = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const result = useMemo(() => computeTax(profile, streams, assets, deductions), [profile, streams, assets, deductions]);
  const bs = useMemo(() => computeBalanceSheet(assets), [assets]);

  const saveStream = (s) => { setStreams(p => p.find(x => x.id === s.id) ? p.map(x => x.id === s.id ? s : x) : [...p, s]); setPanel(null); };
  const delStream = (id) => { setStreams(p => p.filter(x => x.id !== id)); setPanel(null); };
  const saveAsset = (a) => { setAssets(p => p.find(x => x.id === a.id) ? p.map(x => x.id === a.id ? a : x) : [...p, a]); setPanel(null); };
  const delAsset = (id) => { setAssets(p => p.filter(x => x.id !== id)); setPanel(null); };

  const applyPersona = (persona) => {
    if (persona.profile) Object.entries(persona.profile).forEach(([k, v]) => updProfile(k, v));
    setStreams(prev => [...prev, ...persona.streams.map(s => ({ ...s, id: uid() }))]);
  };
  const resetAll = () => { setProfile(PRELOAD_PROFILE); setStreams(PRELOAD_STREAMS); setAssets(PRELOAD_ASSETS); setDeds(PRELOAD_DEDUCTIONS); setEntities(PRELOAD_ENTITIES); };
  const clearAll = () => { setProfile(DEFAULT_PROFILE); setStreams([]); setAssets([]); setDeds([]); setEntities([]); };

  return <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", color: C.text, display: "flex" }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
      @import url('https://api.fontshare.com/v2/css?f[]=erode@400,500,600&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
      ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#C8C4BC;border-radius:2px;}
      select option{background:#FFFFFF;}
      @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
    `}</style>

    {/* Sidebar - Navy */}
    <div style={{ width: 210, background: C.navBg, borderRight: `1px solid ${C.navBorder}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.navBorder}` }}>
        <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 20, color: "#FFFFFF", letterSpacing: "0.04em" }}>Yosemite</div>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.navAccent, marginTop: 2 }}>{"v2 beta-C"}</div>
      </div>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.navBorder}` }}>
        <input value={profile.name} onChange={e => updProfile("name", e.target.value)} placeholder="Client / Household Name"
          style={{ width: "100%", background: "none", border: "none", fontSize: 12, color: "#FFFFFF", outline: "none" }} />
        <div style={{ fontSize: 10, color: C.navText, marginTop: 3 }}>{profile.filingStatus.toUpperCase()} {"| "}{STATE_RATES[profile.state]?.label || profile.state}{" | 2025"}</div>
      </div>
      <nav style={{ flex: 1, padding: "10px 0" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px",
              background: tab === t.id ? C.navActive : "none",
              border: "none", borderLeft: `2px solid ${tab === t.id ? C.navAccent : "transparent"}`,
              color: tab === t.id ? "#FFFFFF" : C.navText, cursor: "pointer", fontSize: 13,
              fontFamily: "inherit",
            }}>
            <span style={{ fontSize: 12, color: tab === t.id ? C.navAccent : C.navText, width: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {/* Sidebar live estimate */}
      <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.navBorder}` }}>
        <div style={{ fontSize: 9, color: C.navText, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Live Estimate</div>
        {[
          { l: "Net Worth", v: fmtD(bs.netWorth, true), c: C.gold },
          { l: "AGI", v: fmtD(result.agi, true) },
          { l: "Total Tax", v: fmtD(result.totalTax, true), c: "#E07060" },
          { l: "Withholding", v: fmtD(result.totalWithholding, true), c: "#D4924A" },
          { l: "Eff. Rate", v: pct(result.effectiveRate) },
          { l: "Net Cash", v: fmtD(result.netCashAfterTax, true), c: result.netCashAfterTax >= 0 ? "#5EAA82" : "#E07060" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}>
            <span style={{ color: C.navText }}>{r.l}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: r.c || "#A0B0C0" }}>{r.v}</span>
          </div>
        ))}
      </div>
      {/* Quick Load */}
      <div style={{ padding: "10px 16px 16px", borderTop: `1px solid ${C.navBorder}` }}>
        <div style={{ fontSize: 9, color: C.navText, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Quick Load</div>
        <button onClick={resetAll}
          style={{ display: "block", width: "100%", textAlign: "left", background: C.navAccent + "20", border: `1px solid ${C.navAccent}40`, borderRadius: 3,
            padding: "5px 8px", color: C.navAccent, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginBottom: 4 }}>
          {"Reset to Test Family"}
        </button>
        <button onClick={clearAll}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: `1px solid ${C.navBorder}`, borderRadius: 3,
            padding: "5px 8px", color: C.navText, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginBottom: 6 }}>
          {"Clear All"}
        </button>
        {PERSONA_PRESETS.map((p, i) => (
          <button key={i} onClick={() => applyPersona(p)}
            style={{
              display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
              padding: "5px 4px", color: C.textDim, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              borderRadius: 3,
            }}
            onMouseOver={e => e.target.style.color = C.accent}
            onMouseOut={e => e.target.style.color = C.textDim}>
            {p.label}
          </button>
        ))}
      </div>
    </div>

    {/* Main Content */}
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      {tab === "overview" && <OverviewTab profile={profile} result={result} streams={streams} assets={assets} updProfile={updProfile} bs={bs} />}
      {tab === "balsheet" && <BalanceSheetTab assets={assets} bs={bs} onEdit={a => setPanel({type:"asset",data:a})} onAdd={() => setPanel({type:"asset",data:null})} onDelete={delAsset} />}
      {tab === "income" && <IncomeTab streams={streams} assets={assets} onEdit={s => setPanel({ type: "income", data: s })} onAdd={() => setPanel({ type: "income", data: null })} onDelete={delStream} />}
      {tab === "deductions" && <DeductionsTab deductions={deductions} setDeductions={setDeds} profile={profile} updProfile={updProfile} result={result} />}
      {tab === "cashflow" && <CashFlowTab profile={profile} streams={streams} result={result} />}
      {tab === "entities" && <EntitiesTab entities={entities} setEntities={setEntities} />}
      {tab === "esttax" && <EstTaxTab profile={profile} updProfile={updProfile} result={result} streams={streams} />}
    </div>

    {/* Slide Panels */}
    <SlidePanel open={panel?.type === "income"} onClose={() => setPanel(null)} title={panel?.data ? "Edit Income Stream" : "Add Income Stream"}>
      <IncomePanel key={panel?.data?.id || "new-income"} stream={panel?.data} onSave={saveStream} onDelete={delStream} onClose={() => setPanel(null)} entities={entities} />
    </SlidePanel>
    <SlidePanel open={panel?.type === "asset"} onClose={() => setPanel(null)} title={panel?.data ? "Edit Asset" : "Add Asset"}>
      <AssetEditor key={panel?.data?.id || "new-asset"} asset={panel?.data} onSave={saveAsset} onDelete={delAsset} entities={entities} />
    </SlidePanel>
  </div>;
}
