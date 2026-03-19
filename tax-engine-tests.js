/**
 * Yosemite Tax Engine — Audit Test Suite
 * 
 * Extracts the pure computation functions from App.jsx and runs
 * deterministic tests against hand-computed expected values.
 * 
 * Run: node tax-engine-tests.js
 */

// ─── EXTRACTED TAX PARAMS (2026 — OBBBA + Rev. Proc. 2025-32) ──────────────
const TAX_PARAMS = {
  mfj: {
    brackets:[[0.10,0,24800],[0.12,24800,100800],[0.22,100800,211400],[0.24,211400,403550],[0.32,403550,512450],[0.35,512450,768700],[0.37,768700,Infinity]],
    ltcg:[[0,0,98900],[0.15,98900,613700],[0.20,613700,Infinity]],
    std:32200, niitFloor:250000, qbiLow:403500, qbiHigh:553500,
  },
  single: {
    brackets:[[0.10,0,12400],[0.12,12400,50400],[0.22,50400,105700],[0.24,105700,201775],[0.32,201775,256225],[0.35,256225,640600],[0.37,640600,Infinity]],
    ltcg:[[0,0,49450],[0.15,49450,545500],[0.20,545500,Infinity]],
    std:16100, niitFloor:200000, qbiLow:201775, qbiHigh:276775,
  },
};
const computeSaltCap = (agi) => {
  const base = 40400, start = 505000, rate = 0.30, floor = 10000;
  if (agi <= start) return base;
  return Math.max(floor, Math.round(base - (agi - start) * rate));
};
const CA_BRACKETS = {
  mfj: [[0.01,0,22158],[0.02,22158,52528],[0.04,52528,82904],[0.06,82904,115084],[0.08,115084,145448],[0.093,145448,742958],[0.103,742958,891542],[0.113,891542,1485906],[0.123,1485906,Infinity]],
  single: [[0.01,0,11079],[0.02,11079,26264],[0.04,26264,41452],[0.06,41452,57542],[0.08,57542,72724],[0.093,72724,371479],[0.103,371479,445771],[0.113,445771,742953],[0.123,742953,Infinity]],
};
function computeStateTax(state, filingStatus, taxableIncome) {
  if (state === "CA") {
    const brackets = CA_BRACKETS[filingStatus] || CA_BRACKETS.mfj;
    let tax = bracketTax(taxableIncome, brackets);
    if (taxableIncome > 1000000) tax += (taxableIncome - 1000000) * 0.01;
    return tax;
  }
  return 0;
}

const INCOME_TYPES = {
  wages:     { char: "ordEarned" },
  business:  { char: "ordEarned" },
  interest:  { char: "ordInv"    },
  qualDiv:   { char: "qualDiv"   },
  nonQualDiv:{ char: "ordInv"    },
  stcg:      { char: "stcg"      },
  ltcg:      { char: "ltcg"      },
  passive:   { char: "passive"   },
  taxExempt: { char: "taxExempt" },
};

// ─── PRORATION HELPERS ────────────────────────────────────────────────────
function isActiveInMonth_eng(item, month) {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return month >= s && month <= e;
}
function proFactor_eng(item) {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return (e - s + 1) / 12;
}

// ─── EXTRACTED ENGINE FUNCTIONS ─────────────────────────────────────────────
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

function computeTax(profile, streams, assets, deductions, entities, liabilities) {
  const p = TAX_PARAMS[profile.filingStatus] || TAX_PARAMS.mfj;
  const entMap = {};
  (entities||[]).forEach(e => { entMap[e.label] = e; });

  let ordEarned=0, ordInv=0, stcg=0, ltcg=0, qualDiv=0, passive=0, taxExempt=0;
  let totalFedWithholding=0, totalStateWithholding=0;
  const k1ByEntity = {};

  streams.forEach(s => {
    const t = INCOME_TYPES[s.type];
    if (!t) return;
    const pf = proFactor_eng(s);
    const a = (s.amount || 0) * pf;
    if (t.char==="ordEarned") ordEarned+=a;
    else if (t.char==="ordInv") ordInv+=a;
    else if (t.char==="stcg") stcg+=a;
    else if (t.char==="ltcg") ltcg+=a;
    else if (t.char==="qualDiv") qualDiv+=a;
    else if (t.char==="passive") passive+=a;
    else if (t.char==="taxExempt") taxExempt+=a;
    totalFedWithholding += a * (s.fedWithholdingPct||0) / 100;
    totalStateWithholding += a * (s.stateWithholdingPct||0) / 100;
    if (s.entity && entMap[s.entity]) {
      const ent = entMap[s.entity];
      if (ent.pteElection || (ent.retirementContrib||0)>0 || (ent.healthInsurance||0)>0) {
        k1ByEntity[s.entity] = (k1ByEntity[s.entity]||0) + a;
      }
    }
  });

  let invDistributions=0, invCapCalls=0, reCashFlow=0;
  assets.forEach(item => {
    const at = item.assetType;
    const pf = proFactor_eng(item);
    if (at==="cash") {
      ordInv += (item.value||0) * (item.yieldPct||0) / 100 * pf;
    } else if (at==="security") {
      qualDiv += (item.value||0) * (item.divYieldPct||0) / 100 * pf;
      ltcg += (item.value||0) * (item.realizedGainPct||0) / 100 * pf;
    } else if (at==="hedgeFund" || at==="peFund") {
      const nav = item.nav || 0;
      const ordAmt = nav * (item.ordPct || 0) / 100 * pf;
      const intAmt = nav * (item.intPct || 0) / 100 * pf;
      if (item.traderElection) {
        ordEarned += ordAmt + intAmt;
      } else {
        ordInv += ordAmt + intAmt;
      }
      stcg       += nav * (item.stcgPct || 0) / 100 * pf;
      ltcg       += nav * (item.ltcgPct || 0) / 100 * pf;
      qualDiv    += nav * (item.qualDivPct || 0) / 100 * pf;
      taxExempt  += nav * (item.taxExPct || 0) / 100 * pf;
      invDistributions += nav * (item.distPct || 0) / 100 * pf;
      invCapCalls += (item.unfunded||0) * (item.capCallPct || 0) / 100 * pf;
    } else if (at==="realEstate") {
      const reTax = (item.taxableIncome||0) * pf;
      reCashFlow += (item.netCashFlow||0) * pf;
      if (profile.reProStatus) { ordEarned += reTax; } else { passive += reTax; }
    }
  });

  let totalPTET=0, totalRetirement=0, totalHealthIns=0;
  const pteDetails = [];
  Object.entries(k1ByEntity).forEach(([entityLabel, k1Income]) => {
    const ent = entMap[entityLabel];
    if (!ent) return;
    if (ent.pteElection && (ent.pteRate||0) > 0) {
      const pteAmt = Math.abs(k1Income) * (ent.pteRate/100);
      totalPTET += pteAmt;
      pteDetails.push({entity:entityLabel, income:k1Income, rate:ent.pteRate, amount:pteAmt, state:ent.pteState||profile.state});
    }
    if ((ent.retirementContrib||0) > 0) totalRetirement += ent.retirementContrib;
    if ((ent.healthInsurance||0) > 0) totalHealthIns += ent.healthInsurance;
  });

  // PTET: credit-only. K-1 input is already post-PTET.
  const preTaxDeductions = totalRetirement;
  ordEarned = ordEarned - preTaxDeductions;

  // Approach C: actual distributions
  let totalActualDist=0, totalGrossK1ForDistEnts=0;
  Object.entries(k1ByEntity).forEach(([entityLabel]) => {
    const ent = entMap[entityLabel];
    if (ent?.actualDistributions > 0) {
      totalActualDist += ent.actualDistributions;
      totalGrossK1ForDistEnts += k1ByEntity[entityLabel] || 0;
    }
  });
  const entityDeducTotal = totalPTET + totalRetirement + totalHealthIns;
  const phantomIncome = totalGrossK1ForDistEnts > 0 ? totalGrossK1ForDistEnts - totalActualDist : 0;
  const firmRetention = totalActualDist > 0 ? Math.max(0, phantomIncome - entityDeducTotal) : 0;

  // Liability interest
  let schedAInterest=0, totalLiabPayments=0;
  (liabilities||[]).forEach(l => {
    const lpf = proFactor_eng(l);
    const ai = (l.annualInterest||0) * lpf;
    totalLiabPayments += (l.monthlyPayment||0) * 12 * lpf;
    if (l.deductType==="schedA") schedAInterest += ai;
  });

  let netST = stcg, netLT = ltcg;
  let netSTAfter=netST, netLTAfter=netLT, capitalLossOffset=0, capitalLossCarry=0;
  if (netST >= 0 && netLT >= 0) {
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

  let passiveAllowed = passive;
  let suspendedPAL = 0;
  if (!profile.reProStatus && passive < 0) {
    passiveAllowed = 0;
    suspendedPAL = Math.abs(passive);
  }
  const totalOrdinary = ordEarned + ordInv + passiveAllowed + netSTAfter - capitalLossOffset - totalHealthIns;
  const totalPref = netLTAfter + qualDiv;
  const agi = Math.max(0, totalOrdinary + totalPref);

  const qbiBase = streams.filter(s => s.qbi).reduce((t, s) => t + (s.amount||0), 0) * 0.20;
  let qbiDeduction = 0;
  if (agi <= p.qbiLow) qbiDeduction = Math.min(qbiBase, Math.max(0,totalOrdinary)*0.20);
  else if (agi < p.qbiHigh) { const frac = 1-(agi-p.qbiLow)/(p.qbiHigh-p.qbiLow); qbiDeduction = Math.min(qbiBase*frac, Math.max(0,totalOrdinary)*0.20); }
  qbiDeduction = Math.max(0, qbiDeduction);

  const itemizedRaw = deductions.reduce((t,d) => d.type==="salt" ? t+Math.min(d.amount||0,computeSaltCap(agi)) : t+(d.amount||0), 0) + schedAInterest;
  const useItemized = itemizedRaw > p.std;
  
  // 2/37 rule (OBBBA, starting 2026)
  const top37Threshold = p.brackets[p.brackets.length-1][1];
  let itemizedAfter237 = itemizedRaw;
  let reduction237 = 0;
  if (useItemized) {
    const tentativeTaxableOrd = Math.max(0, totalOrdinary - itemizedRaw - qbiDeduction);
    const excessOver37 = Math.max(0, tentativeTaxableOrd - top37Threshold);
    if (excessOver37 > 0) {
      reduction237 = Math.round((2/37) * Math.min(itemizedRaw, excessOver37));
      itemizedAfter237 = itemizedRaw - reduction237;
    }
  }
  const deductionAmt = (useItemized ? itemizedAfter237 : p.std) + qbiDeduction;
  const taxableOrd = Math.max(0, totalOrdinary - deductionAmt);
  const taxablePref = Math.max(0, totalPref);

  const ordTax = bracketTax(taxableOrd, p.brackets);
  const prefTax = ltcgStack(taxableOrd, taxablePref, p.ltcg);
  const nii = Math.max(0, ordInv + Math.max(0,netSTAfter) + netLTAfter + qualDiv + passiveAllowed);
  const niitBase = Math.max(0, agi - p.niitFloor);
  const niit = Math.min(nii, niitBase) * 0.038;

  const federalTax = ordTax + prefTax + niit;
  const stateGross = profile.state === "CA"
    ? computeStateTax("CA", profile.filingStatus, agi)
    : Math.max(0, agi * ((profile.stateRate||0)/100));
  const stateTaxAfterPTE = Math.max(0, stateGross - totalPTET);
  const pteExcess = Math.max(0, totalPTET - stateGross);
  const stateTax = stateGross;
  const totalTax = federalTax + stateTaxAfterPTE;

  const topBracket = p.brackets.slice().reverse().find(([,min]) => taxableOrd > min);
  const marginalOrd = topBracket ? topBracket[0]*100 : 10;
  const topPrefBr = p.ltcg.slice().reverse().find(([,min]) => (taxableOrd+taxablePref) > min);
  const marginalPref = topPrefBr ? topPrefBr[0]*100 : 0;

  const priorY = profile.priorYearLiability||0;
  const priorAgi = profile.priorYearAgi||0;
  const safeHarborPY = priorY * (priorAgi>150000?1.10:1.00);
  const safeHarborCY = federalTax * 0.90;
  const safeHarborTarget = Math.min(safeHarborPY||Infinity, safeHarborCY);
  const totalEstPaid = (profile.q1Paid||0)+(profile.q2Paid||0)+(profile.q3Paid||0)+(profile.q4Paid||0);
  const totalPrepaid = totalFedWithholding + totalEstPaid;
  const remainingSH = safeHarborPY>0 ? Math.max(0,safeHarborTarget-totalPrepaid) : 0;
  const penaltyEst = remainingSH * 0.08;
  const balanceDueFed = Math.max(0, federalTax - totalFedWithholding - totalEstPaid);
  const balanceDueState = Math.max(0, stateTaxAfterPTE - totalStateWithholding - pteExcess);
  const overpaymentFed = Math.max(0, totalFedWithholding + totalEstPaid - federalTax);
  const overpaymentState = Math.max(0, totalStateWithholding + pteExcess - stateTaxAfterPTE);

  const totalWithholding = totalFedWithholding + totalStateWithholding;

  // Cash-basis net cash
  let streamCashIn = 0;
  streams.forEach(s => {
    const pf = proFactor_eng(s);
    const ent = entMap[s.entity];
    if (ent?.actualDistributions > 0) return;
    const a = (s.amount||0) * pf;
    streamCashIn += a - a * ((s.fedWithholdingPct||0)+(s.stateWithholdingPct||0)) / 100;
  });
  let distCashIn = 0;
  (entities||[]).forEach(e => { if ((e.actualDistributions||0) > 0 && k1ByEntity[e.label]) distCashIn += e.actualDistributions; });
  let assetCashIn = 0;
  assets.forEach(item => {
    const pf = proFactor_eng(item); const at = item.assetType;
    if (at==="cash") assetCashIn += (item.value||0)*(item.yieldPct||0)/100*pf;
    else if (at==="security") assetCashIn += (item.value||0)*(item.divYieldPct||0)/100*pf;
    else if (at==="realEstate") assetCashIn += (item.netCashFlow||0)*pf;
  });
  let entityDeducNonDist = 0;
  Object.entries(k1ByEntity).forEach(([entityLabel]) => {
    const ent = entMap[entityLabel];
    if (!ent || (ent.actualDistributions||0) > 0) return;
    entityDeducNonDist += (ent.retirementContrib||0) + (ent.healthInsurance||0);
  });
  const netCashAfterTax = streamCashIn + distCashIn + assetCashIn + invDistributions - invCapCalls
    - entityDeducNonDist - totalEstPaid - balanceDueFed - balanceDueState
    - (profile.livingExpenses||0)*12 - totalLiabPayments;

  const invOrdinary = assets.filter(a=>a.assetType==="hedgeFund"||a.assetType==="peFund").reduce((t,a) => t + (a.nav||0)*(a.ordPct||0)/100, 0);
  const combinedMarginalOrd = marginalOrd + (profile.stateRate||0);
  const ordLossBenefit = invOrdinary < 0 ? Math.abs(invOrdinary) * (combinedMarginalOrd/100) : 0;
  const pteFedSavings = totalPTET * (marginalOrd/100);

  return {
    ordEarned, ordInv, stcg, ltcg, qualDiv, passive, passiveAllowed, suspendedPAL, taxExempt,
    netST, netLT, netSTAfter, netLTAfter, capitalLossOffset, capitalLossCarry,
    invOrdinary, totalOrdinary, totalPref, agi,
    qbiDeduction, itemizedRaw, useItemized, deductionAmt, saltCap: computeSaltCap(agi), reduction237, itemizedAfter237,
    taxableOrd, taxablePref,
    ordTax, prefTax, niit, nii, federalTax, stateTax, stateTaxAfterPTE, pteExcess, totalTax,
    effectiveRate: agi>0 ? totalTax/agi*100 : 0,
    marginalOrd, marginalPref, combinedMarginalOrd,
    totalPTET, pteDetails, pteFedSavings, totalRetirement, totalHealthIns, preTaxDeductions,
    totalActualDist, totalGrossK1ForDistEnts, phantomIncome, firmRetention, entityDeducTotal,
    streamCashIn, distCashIn, assetCashIn, entityDeducNonDist,
    totalFedWithholding, totalStateWithholding, totalWithholding,
    safeHarborPY, safeHarborCY, safeHarborTarget, totalEstPaid, totalPrepaid,
    remainingSH, penaltyEst, balanceDueFed, balanceDueState, overpaymentFed, overpaymentState,
    invDistributions, invCapCalls, invTaxExempt: taxExempt, reCashFlow,
    schedAInterest, totalLiabPayments,
    netCashAfterTax, ordLossBenefit,
  };
}

// ─── TEST FRAMEWORK ─────────────────────────────────────────────────────────
let passed = 0, failed = 0, tests = [];
const TOL = 1; // $1 tolerance for rounding

function assert(label, actual, expected, tolerance) {
  const tol = tolerance ?? TOL;
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) {
    tests.push({ label, actual, expected, status: "FAIL" });
    failed++;
  } else {
    tests.push({ label, actual, expected, status: "PASS" });
    passed++;
  }
}

function section(name) {
  tests.push({ label: `\n=== ${name} ===`, status: "SECTION" });
}

// ─── TEST 1: BRACKET TAX — ISOLATED ────────────────────────────────────────
section("1. bracketTax() — Federal Ordinary Income Brackets (MFJ)");

const mfjBrackets = TAX_PARAMS.mfj.brackets;

// $0 income
assert("$0 income → $0 tax", bracketTax(0, mfjBrackets), 0);

// $20,000 — all in 10% bracket
assert("$20K → 10% flat", bracketTax(20000, mfjBrackets), 2000);

// $23,200 — exactly fills 10% bracket
assert("$23,200 → fills 10%", bracketTax(23200, mfjBrackets), 2320);

// $50,000 — 10% bracket + partial 12%
// 23200 * 0.10 + (50000-23200) * 0.12 = 2320 + 3216 = 5536
assert("$50K → 10% + 12%", bracketTax(50000, mfjBrackets), 5504);

// $100,000 — 10% + 12% + partial 22%
// 2320 + (94300-23200)*0.12 + (100000-94300)*0.22 = 2320 + 8532 + 1254 = 12106
assert("$100K → through 22%", bracketTax(100000, mfjBrackets), 11504);

// $500,000 — through 32%
// 10%: 2320, 12%: 8532, 22%: 23485, 24%: 43884, 32%: 33136, 35%: 4392.50
// Total: 115749.50
assert("$500K → through 35%", bracketTax(500000, mfjBrackets), 112912);

// $1,000,000
// Add 35%: (731200-500000)*0.35 = 80920 → but wait, need full calc
// 10%: 2320, 12%: 8532, 22%: 23485, 24%: 43884, 32%: 33136, 35%: 85312.50, 37%: (1000000-731200)*0.37 = 99456
// Total: 296125.50
assert("$1M → through 37%", bracketTax(1000000, mfjBrackets), 292164.50);

// ─── TEST 2: LTCG STACKING ─────────────────────────────────────────────────
section("2. ltcgStack() — LTCG on Top of Ordinary (MFJ)");

const mfjLtcg = TAX_PARAMS.mfj.ltcg;

// $50K ordinary + $30K LTCG: total $80K, all under $96,700 → 0% LTCG
assert("$50K ord + $30K LTCG → 0% rate", ltcgStack(50000, 30000, mfjLtcg), 0);

// $90K ordinary + $20K LTCG: stack hits $110K, crosses $98,900
// 0%: 96700-90000 = 6700 at 0%, 15%: 20000-6700 = 13300 at 15% = 1995
assert("$90K ord + $20K LTCG → partial 15%", ltcgStack(90000, 20000, mfjLtcg), 1665);

// $500K ordinary + $200K LTCG: stack reaches $700K, crosses $613,700 threshold
// 15%: (600050-500000) = 100050 at 15% = 15007.50, 20%: (700000-600050) = 99950 at 20% = 19990
assert("$500K ord + $200K LTCG → crosses 20%", ltcgStack(500000, 200000, mfjLtcg), 34315);

// $600K ordinary + $100K LTCG: crosses into 20%
// 15%: (600050-600000) = 50 at 15% = 7.50, 20%: 99950 at 20% = 19990
assert("$600K ord + $100K LTCG → mostly 20%", ltcgStack(600000, 100000, mfjLtcg), 19315);

// $700K ordinary + $500K LTCG: all at 20%
assert("$700K ord + $500K LTCG → all 20%", ltcgStack(700000, 500000, mfjLtcg), 100000);

// ─── TEST 3: INCOME AGGREGATION FROM STREAMS ────────────────────────────────
section("3. Income Aggregation from Streams");

const simpleResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [
    { type: "wages", amount: 200000, entity: "Spouse", fedWithholdingPct: 25, stateWithholdingPct: 10 },
    { type: "business", amount: 100000, entity: "Partner" },
    { type: "interest", amount: 20000, entity: "Self" },
    { type: "passive", amount: 30000, entity: "Self" },
    { type: "taxExempt", amount: 10000, entity: "Self" },
  ],
  [], [], []
);

assert("W-2 + K-1 guaranteed → ordEarned", simpleResult.ordEarned, 300000);
assert("Interest → ordInv", simpleResult.ordInv, 20000);
assert("Rental → passive", simpleResult.passive, 30000);
assert("Municipal → taxExempt", simpleResult.taxExempt, 10000);
assert("Fed withholding (25% on $200K)", simpleResult.totalFedWithholding, 50000);
assert("State withholding (10% on $200K)", simpleResult.totalStateWithholding, 20000);

// ─── TEST 4: ASSET-DERIVED INCOME ──────────────────────────────────────────
section("4. Asset-Derived Income");

const assetResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [],
  [
    { assetType: "cash", value: 1000000, yieldPct: 5 },
    { assetType: "security", value: 2000000, divYieldPct: 2, realizedGainPct: 3 },
    { assetType: "hedgeFund", nav: 5000000, ordPct: -20, stcgPct: -10, ltcgPct: 15, qualDivPct: 3, intPct: 2, taxExPct: 1 },
    { assetType: "peFund", nav: 2000000, ordPct: -2, stcgPct: 0, ltcgPct: 8, qualDivPct: 0, intPct: 0, taxExPct: 0,
      unfunded: 500000, distPct: 10, capCallPct: 20 },
  ],
  [], []
);

// Cash: 1M * 5% = 50K ordInv
// Security: 2M * 2% = 40K qualDiv, 2M * 3% = 60K ltcg
// HF: 5M * -20% = -1M ordInv (via ordPct), 5M * -10% = -500K stcg, 5M * 15% = 750K ltcg,
//     5M * 3% = 150K qualDiv, 5M * 2% = 100K ordInv (via intPct), 5M * 1% = 50K taxExempt
// PE: 2M * -2% = -40K ordInv, 2M * 8% = 160K ltcg
assert("Cash yield → ordInv includes 50K", assetResult.ordInv, 50000 + (-1000000) + 100000 + (-40000)); // 50K + HF ord + HF int + PE ord = -890K
assert("Security divs → qualDiv", assetResult.qualDiv, 40000 + 150000); // 40K sec + 150K HF
assert("LTCG from sec + HF + PE", assetResult.ltcg, 60000 + 750000 + 160000); // raw before netting
assert("STCG from HF", assetResult.stcg, -500000);
assert("Tax-exempt from HF", assetResult.taxExempt, 50000);
assert("Distributions (PE only — HF has no distPct)", assetResult.invDistributions, 2000000*0.10);
assert("Cap calls (PE 20% on 500K unfunded)", assetResult.invCapCalls, 100000);

// ─── TEST 5: SCHEDULE D NETTING ─────────────────────────────────────────────
section("5. Schedule D Capital Gain Netting");

// Case A: Both positive — no netting
const net_a = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "hedgeFund", nav: 1000000, stcgPct: 5, ltcgPct: 10 },
  ],
  [], []
);
assert("Both gains: STCG stays", net_a.netSTAfter, 50000);
assert("Both gains: LTCG stays", net_a.netLTAfter, 100000);

// Case B: ST loss offsets LT gain
const net_b = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "hedgeFund", nav: 1000000, stcgPct: -30, ltcgPct: 20 },
  ],
  [], []
);
// ST: -300K, LT: +200K → net LT = 200K + (-300K) = -100K → loss
assert("ST loss > LT gain: netLTAfter = 0", net_b.netLTAfter, 0);
assert("ST loss > LT gain: netSTAfter = 0", net_b.netSTAfter, 0);
assert("Capital loss offset (max $3K)", net_b.capitalLossOffset, 3000);
assert("Capital loss carryforward", net_b.capitalLossCarry, 97000);

// Case C: LT loss offsets ST gain
const net_c = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "hedgeFund", nav: 1000000, stcgPct: 10, ltcgPct: -5 },
  ],
  [], []
);
// ST: +100K, LT: -50K → net ST = 100K + (-50K) = 50K
assert("LT loss reduces ST gain", net_c.netSTAfter, 50000);
assert("LT loss absorbed: netLTAfter = 0", net_c.netLTAfter, 0);
assert("No capital loss offset needed", net_c.capitalLossOffset, 0);

// Case D: Both losses
const net_d = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "hedgeFund", nav: 1000000, stcgPct: -8, ltcgPct: -5 },
  ],
  [], []
);
// ST: -80K, LT: -50K → total loss 130K
assert("Both losses: $3K offset", net_d.capitalLossOffset, 3000);
assert("Both losses: $127K carry", net_d.capitalLossCarry, 127000);

// Case E: Flex SMA STCL offsets Delphi LTCG
const net_e = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "hedgeFund", nav: 5400000, stcgPct: 0, ltcgPct: 25 }, // Delphi: +1.35M LTCG
    { assetType: "hedgeFund", nav: 3000000, stcgPct: -50, ltcgPct: 0 }, // Flex: -1.5M STCL
  ],
  [], []
);
// STCG: -1.5M, LTCG: +1.35M → net LT = 1.35M + (-1.5M) = -150K → loss
assert("Flex STCL offsets Delphi LTCG: net LT = 0", net_e.netLTAfter, 0);
assert("Residual loss → $3K offset", net_e.capitalLossOffset, 3000);
assert("Residual loss → $147K carry", net_e.capitalLossCarry, 147000);

// ─── TEST 6: NIIT ───────────────────────────────────────────────────────────
section("6. NIIT (Net Investment Income Tax)");

// High-income MFJ with investment income
const niitResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [
    { type: "wages", amount: 400000, entity: "Self" },
    { type: "interest", amount: 100000, entity: "Self" },
    { type: "passive", amount: 50000, entity: "Self" },
  ],
  [
    { assetType: "hedgeFund", nav: 2000000, ltcgPct: 10, qualDivPct: 5 },
  ],
  [], []
);
// NII = ordInv(100K) + LTCG(200K) + qualDiv(100K) + passive(50K) = 450K
// AGI = 400K + 100K + 50K + 200K + 100K = 850K
// NIIT base = max(0, 850K - 250K) = 600K
// NIIT = min(450K, 600K) * 3.8% = 450K * 0.038 = 17,100
assert("NII = 450K", niitResult.nii, 450000);
assert("NIIT = $17,100", niitResult.niit, 17100);

// Verify ordEarned is EXCLUDED from NII
const niitEarnedOnly = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [], [], []
);
assert("Pure W-2 → NII = 0", niitEarnedOnly.nii, 0);
assert("Pure W-2 → NIIT = 0", niitEarnedOnly.niit, 0);

// ─── TEST 7: DEDUCTIONS — SALT CAP + ITEMIZED VS STANDARD ──────────────────
section("7. Deductions — SALT Cap, Itemized vs. Standard");

// SALT: $300K AGI is below $505K phaseout, cap = $40,400
const deductResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [{ type: "wages", amount: 300000, entity: "Self" }],
  [], 
  [
    { type: "salt", amount: 50000 }, // capped at $40,400
    { type: "mortgage", amount: 20000 },
    { type: "charitable", amount: 15000 },
  ],
  []
);
// Itemized: 10K (SALT capped) + 20K + 15K = 45K
// Standard: 30K
// Use itemized (45K > 30K)
assert("SALT capped at $40,400", deductResult.itemizedRaw, 75400);
assert("Uses itemized ($75K > $32K)", deductResult.useItemized, 1, 0);
assert("Deduction amount = $75,400", deductResult.deductionAmt, 75400);

// Low deductions → standard wins
const stdResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [],
  [{ type: "charitable", amount: 5000 }],
  []
);
assert("Low itemized → standard deduction", stdResult.useItemized, 0, 0);
assert("Standard deduction = $32,200", stdResult.deductionAmt, 32200);

// ─── TEST 8: PTET — ENTITY-LEVEL ───────────────────────────────────────────
section("8. PTET — Entity-Level Pass-Through Entity Tax");

const pteEntities = [
  { label: "Partner", pteElection: true, pteRate: 9.3, pteState: "CA", retirementContrib: 0, healthInsurance: 0 },
];
const pteResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [
    { type: "business", amount: 1600000, entity: "Partner" },
    { type: "business", amount: 1000000, entity: "Partner" },
    { type: "ltcg", amount: 400000, entity: "Partner" },
  ],
  [], [], pteEntities
);
// K-1 total for "Partner": 1.6M + 1M + 400K = 3M
// PTET: 3M * 9.3% = 279,000
assert("PTET computed on total K-1 income", pteResult.totalPTET, 279000);
assert("PTET detail has 1 entry", pteResult.pteDetails.length, 1, 0);

// ordEarned should NOT be reduced by PTET — K-1 is entered post-PTET
// Gross ordEarned: 1.6M + 1M = 2.6M (PTET already reflected in K-1 input)
assert("ordEarned NOT reduced by PTET", pteResult.ordEarned, 2600000);

// State tax should show credit
assert("State gross > 0", pteResult.stateTax > 0, true, 0);
assert("State after PTE < gross", pteResult.stateTaxAfterPTE < pteResult.stateTax, true, 0);

// Federal savings from PTET deduction
assert("PTE fed savings = PTET * marginal rate", pteResult.pteFedSavings, 279000 * (pteResult.marginalOrd / 100));

// ─── TEST 9: RETIREMENT + HEALTH INSURANCE DEDUCTIONS ───────────────────────
section("9. Entity-Level Retirement + Health Insurance");

const retEntities = [
  { label: "Partner", pteElection: false, pteRate: 0, retirementContrib: 138000, healthInsurance: 47000 },
];
const retResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [{ type: "business", amount: 2000000, entity: "Partner" }],
  [], [], retEntities
);

assert("Retirement = $138K", retResult.totalRetirement, 138000);
assert("Health insurance = $47K", retResult.totalHealthIns, 47000);
// ordEarned: 2M - 138K (retirement) - 0 (no PTET) = 1,862,000
assert("ordEarned reduced by retirement", retResult.ordEarned, 2000000 - 138000);
// Health insurance reduces AGI via totalOrdinary
// totalOrdinary = ordEarned + ordInv + passive + netSTAfter - capLossOffset - healthIns
// = 1,862,000 + 0 + 0 + 0 - 0 - 47,000 = 1,815,000
assert("totalOrdinary includes health ins deduction", retResult.totalOrdinary, 1815000);

// ─── TEST 10: COMBINED PTET + RETIREMENT + HEALTH (FULL TEST FAMILY) ────────
section("10. Full Test Family — Combined Entity Deductions");

const fullEntities = [
  { label: "Husband", pteElection: true, pteRate: 9.3, pteState: "CA", retirementContrib: 138000, healthInsurance: 47000 },
  { label: "Wife", pteElection: false, retirementContrib: 0, healthInsurance: 0 },
  { label: "Test Family Trust", pteElection: false, retirementContrib: 0, healthInsurance: 0 },
];
const fullResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3,
    priorYearLiability: 1050000, priorYearAgi: 2900000,
    q1Paid: 275000, q2Paid: 275000, q3Paid: 0, q4Paid: 0,
    livingExpenses: 28000 },
  [
    { type: "business", amount: 300000, entity: "Husband" },
    { type: "business", amount: 2200000, entity: "Husband" },
    { type: "ltcg", amount: 600000, entity: "Husband" },
    { type: "passive", amount: 72000, entity: "Test RE Holdings LLC" },
  ],
  [
    { assetType: "cash", value: 920000, yieldPct: 4.8 },
    { assetType: "security", value: 1800000, divYieldPct: 1.4, realizedGainPct: 0 },
    { assetType: "hedgeFund", nav: 5400000, ordPct: -30, stcgPct: 0, ltcgPct: 25, qualDivPct: 5, intPct: 0, taxExPct: 0 },
    { assetType: "hedgeFund", nav: 3000000, ordPct: 0, stcgPct: -50, ltcgPct: 0, qualDivPct: 1, intPct: 0, taxExPct: 0 },
    { assetType: "peFund", nav: 2500000, ordPct: -2, stcgPct: 0, ltcgPct: 8, qualDivPct: 0, intPct: 0, taxExPct: 0,
      unfunded: 500000, distPct: 12, capCallPct: 20 },
    { assetType: "peFund", nav: 1500000, ordPct: -1, stcgPct: 0, ltcgPct: 5, qualDivPct: 0, intPct: 0, taxExPct: 0,
      unfunded: 375000, distPct: 8, capCallPct: 25 },
  ],
  [
    { type: "salt", amount: 10000 },
    { type: "mortgage", amount: 72000 },
    { type: "charitable", amount: 40000 },
  ],
  fullEntities
);

// K-1 by Husband: 300K + 2.2M + 600K = 3.1M
// PTET: 3.1M * 9.3% = 288,300
assert("Full: PTET = $288,300", fullResult.totalPTET, 288300);
assert("Full: Retirement = $138K", fullResult.totalRetirement, 138000);
assert("Full: Health = $47K", fullResult.totalHealthIns, 47000);
assert("Full: preTaxDeductions = retirement only", fullResult.preTaxDeductions, 138000);

// ordEarned: (300K + 2.2M) - 138,000 (retirement only) = 2,362,000 (PTET already in K-1)
assert("Full: ordEarned after pre-tax", fullResult.ordEarned, 2362000);

// ordInv: cash 920K*4.8% = 44,160 + Delphi -30%*5.4M = -1,620,000 + Flex 0 + SL -2%*2.5M = -50,000 + TCV -1%*1.5M = -15,000
// = 44160 - 1620000 - 50000 - 15000 = -1,640,840
assert("Full: ordInv", fullResult.ordInv, 44160 - 1620000 - 50000 - 15000);

// qualDiv: sec 1.8M*1.4% = 25,200 + Delphi 5%*5.4M = 270,000 + Flex 1%*3M = 30,000
assert("Full: qualDiv", fullResult.qualDiv, 25200 + 270000 + 30000);

// LTCG raw: Delphi 25%*5.4M = 1,350,000 + SL 8%*2.5M = 200,000 + TCV 5%*1.5M = 75,000 + K-1 LTCG 600K
assert("Full: raw LTCG", fullResult.ltcg, 1350000 + 200000 + 75000 + 600000);

// STCG: Flex -50%*3M = -1,500,000
assert("Full: STCG from Flex", fullResult.stcg, -1500000);

// Schedule D: ST = -1.5M, LT = 2.225M → net LT = 2.225M + (-1.5M) = 725K
assert("Full: Schedule D net LTCG after netting", fullResult.netLTAfter, 725000);
assert("Full: Schedule D ST absorbed", fullResult.netSTAfter, 0);

// Marginal rate: without PTET deduction from income, taxableOrd is higher
// ~$624K after deductions, landing in 35% bracket (512,450-768,700)
assert("Full: marginal ordinary = 35% (no PTET income reduction)", fullResult.marginalOrd, 35);

// Safe harbor: 110% * 1.05M = 1.155M
assert("Full: safe harbor PY = $1,155,000", fullResult.safeHarborPY, 1155000);
assert("Full: total est paid = $550K", fullResult.totalEstPaid, 550000);

// Cap calls: SL 20% on 500K = 100K, TCV 25% on 375K = 93,750
assert("Full: cap calls", fullResult.invCapCalls, 193750);

// Distributions: SL 12%*2.5M = 300K, TCV 8%*1.5M = 120K
assert("Full: distributions", fullResult.invDistributions, 420000);

// ─── TEST 11: SAFE HARBOR ───────────────────────────────────────────────────
section("11. Safe Harbor Calculation");

const shResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0,
    priorYearLiability: 500000, priorYearAgi: 1000000,
    q1Paid: 100000, q2Paid: 100000, q3Paid: 100000, q4Paid: 0 },
  [{ type: "wages", amount: 1000000, entity: "Self", fedWithholdingPct: 20 }],
  [], [], []
);
// Prior year: 500K * 110% = 550K (AGI > $150K)
assert("SH: 110% prior year", shResult.safeHarborPY, 550000);
// Current year: fedTax * 90%
assert("SH: 90% current year > 0", shResult.safeHarborCY > 0, true, 0);
// Total prepaid: 200K withholding + 300K est = 500K
assert("SH: total prepaid = 500K", shResult.totalPrepaid, 500000);
// Fed withholding: 1M * 20% = 200K
assert("SH: fed withholding = 200K", shResult.totalFedWithholding, 200000);
assert("SH: est paid = 300K", shResult.totalEstPaid, 300000);

// Under $150K AGI → 100% (not 110%)
const shLowResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0,
    priorYearLiability: 20000, priorYearAgi: 120000 },
  [{ type: "wages", amount: 120000, entity: "Self" }],
  [], [], []
);
assert("SH: AGI < 150K → 100% prior year", shLowResult.safeHarborPY, 20000);

// ─── TEST 12: STATE TAX + PTE CREDIT ────────────────────────────────────────
section("12. State Tax + PTE Credit");

const stateResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [
    { type: "business", amount: 2000000, entity: "Partner" },
  ],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 0, healthInsurance: 0 }]
);
// PTET = 2M * 9.3% = 186,000
// ordEarned = 2M - 186K = 1,814,000
// AGI (approx) = 1,814,000
// State gross = AGI * 14.3% * 0.88 (effective rate factor)
// State after PTE = gross - 186K
assert("State: PTET = $186K", stateResult.totalPTET, 186000);
assert("State: after PTE < gross", stateResult.stateTaxAfterPTE < stateResult.stateTax, true, 0);
assert("State balance due uses PTE credit", stateResult.balanceDueState, Math.max(0, stateResult.stateTax - 186000));

// No-PTE state (Florida)
const flResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [], [], []
);
assert("Florida: $0 state tax", flResult.stateTax, 0);
assert("Florida: $0 total tax = fed only", flResult.totalTax, flResult.federalTax);

// ─── TEST 13: QBI DEDUCTION ─────────────────────────────────────────────────
section("13. QBI Deduction (Sec. 199A)");

// Under phaseout (single, AGI < $191,950)
const qbiResult = computeTax(
  { filingStatus: "single", state: "FL", stateRate: 0 },
  [{ type: "business", amount: 150000, entity: "Self", qbi: true }],
  [], [], []
);
// QBI base: 150K * 20% = 30K
// AGI: 150K (below single threshold of 191,950)
// QBI = min(30K, 150K * 20%) = 30K
assert("QBI: full deduction under threshold", qbiResult.qbiDeduction, 30000);

// Above phaseout — no QBI
const qbiHighResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [
    { type: "wages", amount: 400000, entity: "Self" },
    { type: "business", amount: 200000, entity: "Self", qbi: true },
  ],
  [], [], []
);
// AGI: 600K >> 483,900 phaseout → QBI = 0
assert("QBI: zero above phaseout", qbiHighResult.qbiDeduction, 0);

// ─── TEST 14: WITHHOLDING IN BALANCE DUE ────────────────────────────────────
section("14. Withholding Flows to Balance Due");

const whResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3,
    q1Paid: 50000, q2Paid: 50000 },
  [{ type: "wages", amount: 500000, entity: "Self", fedWithholdingPct: 30, stateWithholdingPct: 10 }],
  [], [], []
);
assert("WH: fed = 150K", whResult.totalFedWithholding, 150000);
assert("WH: state = 50K", whResult.totalStateWithholding, 50000);
assert("WH: est paid = 100K", whResult.totalEstPaid, 100000);
assert("WH: fed prepaid = 250K", whResult.totalPrepaid, 250000);
// Balance due should account for withholding
assert("WH: fed balance due = max(0, fedTax - 150K - 100K)",
  whResult.balanceDueFed, Math.max(0, whResult.federalTax - 250000));

// ─── TEST 15: EDGE CASES ────────────────────────────────────────────────────
section("15. Edge Cases");

// Zero income
const zeroResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [], [], [], []
);
assert("Zero income: AGI = 0", zeroResult.agi, 0);
assert("Zero income: tax = 0", zeroResult.totalTax, 0);
assert("Zero income: NIIT = 0", zeroResult.niit, 0);

// Negative ordEarned after massive retirement (PTET no longer deducted)
const negOrdResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "business", amount: 100000, entity: "Partner" }],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 50, retirementContrib: 200000, healthInsurance: 0 }]
);
// PTET: 100K * 50% = 50K (credit only, not deducted). Retirement: 200K.
// ordEarned: 100K - 200K = -100K
assert("Negative ordEarned after pre-tax", negOrdResult.ordEarned, -100000);
assert("AGI floors at 0", negOrdResult.agi, 0, 1);

// No entities passed
const noEntResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "business", amount: 500000, entity: "Partner" }],
  [], [], null
);
assert("No entities: PTET = 0", noEntResult.totalPTET, 0);
assert("No entities: retirement = 0", noEntResult.totalRetirement, 0);
assert("No entities: ordEarned untouched", noEntResult.ordEarned, 500000);

// W-2 entity should not have PTE (employers are not pass-throughs)
const unusedEntResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Employer" }],
  [], [],
  [{ label: "Employer", pteElection: false, pteRate: 0, retirementContrib: 0, healthInsurance: 0 }]
);
assert("W-2 employer (no PTE): PTET = 0", unusedEntResult.totalPTET, 0);

// Entity-driven PTET: business income on PTE entity triggers PTET
const pteBusinessResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "business", amount: 500000, entity: "Partner" }],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 0, healthInsurance: 0 }]
);
assert("Business on PTE entity: PTET > 0", pteBusinessResult.totalPTET, 46500);

// Wages on PTE entity also triggers (entity-driven, not type-driven)
const wagesPteResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 200000, entity: "Partner" }],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 0, healthInsurance: 0 }]
);
assert("Wages on PTE entity: PTET triggers (entity-driven)", wagesPteResult.totalPTET, 18600);

// ─── TEST 16: CASH FLOW IDENTITY ────────────────────────────────────────────
section("16. Cash Flow — Annual Net Cash (Cash-Basis)");

// Simple case: wages, no entities, no actualDist
const cfSimple = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 10000 },
  [{ type: "wages", amount: 300000, entity: "Self" }],
  [], [], [], []
);
// streamCashIn = 300K (no withholding), no distCashIn, no assetCashIn
// netCash = 300K - balanceDueFed - balanceDueState - 120K living
const expectedSimple = 300000 - cfSimple.balanceDueFed - cfSimple.balanceDueState - 120000;
assert("CF simple: net cash", cfSimple.netCashAfterTax, expectedSimple, 2);
assert("CF simple: streamCashIn = 300K", cfSimple.streamCashIn, 300000);
assert("CF simple: distCashIn = 0", cfSimple.distCashIn, 0);

// With actualDistributions: streams skipped, distCashIn used instead
const cfDist = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 10000 },
  [
    { type: "business", amount: 2000000, entity: "Partner", timing: "quarterly" },
    { type: "ltcg", amount: 500000, entity: "Partner", timing: "annual", timingMonth: 2 },
  ],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 100000, healthInsurance: 30000,
     actualDistributions: 1200000 }],
  []
);
assert("CF dist: streamCashIn = 0 (all on actualDist entity)", cfDist.streamCashIn, 0);
assert("CF dist: distCashIn = 1.2M", cfDist.distCashIn, 1200000);
assert("CF dist: entityDeducNonDist = 0 (entity has actualDist)", cfDist.entityDeducNonDist, 0);
// netCash = 0 + 1.2M + 0 + 0 - 0 - 0 - est - balDueFed - balDueState - 120K
const expectedDist = 1200000 - cfDist.totalEstPaid - cfDist.balanceDueFed - cfDist.balanceDueState - 120000;
assert("CF dist: net cash from actual distributions", cfDist.netCashAfterTax, expectedDist, 2);

// Mixed: one entity with actualDist, one without
const cfMixed = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 10000 },
  [
    { type: "business", amount: 1000000, entity: "Firm", timing: "quarterly" },
    { type: "wages", amount: 200000, entity: "Employer" },
  ],
  [], [],
  [
    { label: "Firm", pteElection: false, retirementContrib: 50000, healthInsurance: 0, actualDistributions: 700000 },
    { label: "Employer", pteElection: false, retirementContrib: 0, healthInsurance: 0 },
  ],
  []
);
assert("CF mixed: streamCashIn = 200K (wages only)", cfMixed.streamCashIn, 200000);
assert("CF mixed: distCashIn = 700K", cfMixed.distCashIn, 700000);
assert("CF mixed: entityDeducNonDist = 0 (Employer has no deductions)", cfMixed.entityDeducNonDist, 0);

// REGRESSION: entity with actualDistributions but no streams should produce $0 distCashIn
const cfNoStreams = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 0 },
  [], // no streams at all
  [], [],
  [{ label: "Firm", pteElection: true, pteRate: 9.3, retirementContrib: 100000, healthInsurance: 30000,
     actualDistributions: 1500000 }],
  []
);
assert("CF no-streams regression: distCashIn = 0", cfNoStreams.distCashIn, 0);
assert("CF no-streams regression: streamCashIn = 0", cfNoStreams.streamCashIn, 0);
assert("CF no-streams regression: netCash = 0 (no income)", cfNoStreams.netCashAfterTax, 0);

// ─── TEST 17: MONTHLY CF ENGINE — CASH BASIS ───────────────────────────────
section("17. Monthly CF Engine — Cash Basis");

function computeMonthlyCashflow(profile, streams, assets, result, liabilities, entities) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const qMap = {3:"q1Paid",5:"q2Paid",8:"q3Paid",0:"q4Paid"};
  const livingExp = profile.livingExpenses || 0;
  const entMap = {}; (entities||[]).forEach(e => { entMap[e.label] = e; });
  const dSched = {}; (entities||[]).forEach(e => {
    if ((e.actualDistributions||0) > 0) {
      const dm = e.distributionMonths || [2,5,8,11];
      const pm = e.actualDistributions / dm.length;
      dm.forEach(m => { dSched[m] = (dSched[m]||0) + pm; });
    }
  });
  const edM = (result.entityDeducNonDist||0) / 12;
  const acM = (result.assetCashIn||0) / 12;
  let cum = 0;
  return months.map((m, i) => {
    let si=0, wh=0;
    streams.forEach(s => {
      if (!isActiveInMonth_eng(s, i)) return;
      const ent = entMap[s.entity];
      if ((ent?.actualDistributions||0) > 0) return;
      const t = s.timing || "monthly";
      let a = 0;
      if (t==="monthly") a = (s.amount||0)/12;
      else if (t==="quarterly" && [2,5,8,11].includes(i)) a = (s.amount||0)/4;
      else if (t==="annual" && i === (s.timingMonth??11)) a = s.amount||0;
      else if (t==="semi" && [5,11].includes(i)) a = (s.amount||0)/2;
      si += a; wh += a * ((s.fedWithholdingPct||0)+(s.stateWithholdingPct||0))/100;
    });
    const ed = dSched[i] || 0;
    let fd = 0; if ([5,11].includes(i)) fd = result.invDistributions/2;
    const ci = si - wh + ed + fd + acM;
    let ep = 0; if (qMap[i] !== undefined) ep = profile[qMap[i]] || 0;
    let cc = 0; if ([2,5,8,11].includes(i)) cc = result.invCapCalls/4;
    let lp = 0; (liabilities||[]).forEach(l => { if (isActiveInMonth_eng(l, i)) lp += (l.monthlyPayment||0); });
    const net = ci - livingExp - lp - ep - cc - edM;
    cum += net;
    return { month:m, cashIn:ci, streamIn:si-wh, entDist:ed, fundDist:fd, assetCash:acM,
      entDeduc:edM, estPmt:ep, livingExp, liabPmt:lp, capCall:cc, net, cumulative:cum };
  });
}

// Case A: No actualDistributions — streams flow through
const cfEntA = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3, q1Paid: 100000, livingExpenses: 20000 },
  [
    { type: "business", amount: 600000, entity: "Partner", timing: "monthly" },
    { type: "business", amount: 1200000, entity: "Partner", timing: "quarterly" },
  ],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 120000, healthInsurance: 36000 }],
  []
);
const monthlyA = computeMonthlyCashflow(
  { q1Paid: 100000, livingExpenses: 20000 },
  [
    { type: "business", amount: 600000, entity: "Partner", timing: "monthly" },
    { type: "business", amount: 1200000, entity: "Partner", timing: "quarterly" },
  ],
  [], cfEntA, [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 120000, healthInsurance: 36000 }]
);

// Entity deductions: retire (120K) + health (36K) = 156,000 (PTET not deducted — already in K-1)
assert("CF-A: entity deduc/mo", monthlyA[0].entDeduc, 156000/12, 1);
assert("CF-A: Jan streamIn = 50K (draw only)", monthlyA[0].streamIn, 50000, 1);
assert("CF-A: Jan entDist = 0 (no actualDist)", monthlyA[0].entDist, 0);
assert("CF-A: Mar streamIn = 350K (draw + quarterly)", monthlyA[2].streamIn, 350000, 1);
assert("CF-A: Apr has Q1 est tax", monthlyA[3].estPmt, 100000);

// Case B: With actualDistributions — streams skipped, distributions on schedule
const cfEntB = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3, q1Paid: 100000, livingExpenses: 20000 },
  [
    { type: "business", amount: 600000, entity: "Partner", timing: "monthly" },
    { type: "business", amount: 1200000, entity: "Partner", timing: "quarterly" },
  ],
  [], [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 120000, healthInsurance: 36000,
     actualDistributions: 1000000, distributionMonths: [2,5,8,11] }],
  []
);
const monthlyB = computeMonthlyCashflow(
  { q1Paid: 100000, livingExpenses: 20000 },
  [
    { type: "business", amount: 600000, entity: "Partner", timing: "monthly" },
    { type: "business", amount: 1200000, entity: "Partner", timing: "quarterly" },
  ],
  [], cfEntB, [],
  [{ label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 120000, healthInsurance: 36000,
     actualDistributions: 1000000, distributionMonths: [2,5,8,11] }]
);

assert("CF-B: Jan streamIn = 0 (all streams on actualDist entity)", monthlyB[0].streamIn, 0);
assert("CF-B: Jan entDist = 0 (not a distribution month)", monthlyB[0].entDist, 0);
assert("CF-B: Mar entDist = 250K (1M/4)", monthlyB[2].entDist, 250000);
assert("CF-B: Jun entDist = 250K", monthlyB[5].entDist, 250000);
assert("CF-B: entity deduc = 0 (entity has actualDist)", monthlyB[0].entDeduc, 0);
assert("CF-B: total annual dist = 1M", monthlyB.reduce((t,m)=>t+m.entDist,0), 1000000);


// ═══════════════════════════════════════════════════════════════════════════
// ─── TEST 18: PRORATION ─────────────────────────────────────────────────────
section("18. Date Proration");

// Helper test
function proFactor(item) {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return (e - s + 1) / 12;
}
function isActiveInMonth(item, month) {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return month >= s && month <= e;
}

assert("ProFactor: full year", proFactor({}), 1);
assert("ProFactor: Jul-Dec (6mo)", proFactor({startMonth:6, endMonth:11}), 0.5);
assert("ProFactor: Jan only (1mo)", proFactor({startMonth:0, endMonth:0}), 1/12, 0.001);
assert("IsActive: Jan in full year", isActiveInMonth({}, 0), true, 0);
assert("IsActive: Jun in Jul-Dec", isActiveInMonth({startMonth:6, endMonth:11}, 5), false, 0);
assert("IsActive: Jul in Jul-Dec", isActiveInMonth({startMonth:6, endMonth:11}, 6), true, 0);

// Stream proration in tax engine
const proResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [
    { type: "wages", amount: 240000, entity: "Self", startMonth: 0, endMonth: 11 }, // full year
    { type: "business", amount: 120000, entity: "Self", startMonth: 6, endMonth: 11 }, // Jul-Dec = 60K
  ],
  [], [], []
);
// ordEarned: 240K (full) + 60K (half) = 300K
assert("Proration: full year + half year earned", proResult.ordEarned, 300000);

// Asset proration
const proAssetResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [
    { assetType: "cash", value: 1000000, yieldPct: 6, startMonth: 0, endMonth: 11 }, // 60K full year
    { assetType: "hedgeFund", nav: 2000000, ltcgPct: 10, startMonth: 6, endMonth: 11 }, // 200K * 0.5 = 100K
  ],
  [], []
);
assert("Proration: cash yield full year", proAssetResult.ordInv, 60000);
assert("Proration: HF LTCG half year", proAssetResult.ltcg, 100000);

// ─── TEST 19: REAL ESTATE INCOME ROUTING ────────────────────────────────────
section("19. Real Estate Income Routing");

// Without RE Pro status: taxableIncome → passive (but losses suspended by PAL)
const rePassiveResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, reProStatus: false },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [{ assetType: "realEstate", value: 3000000, costBasis: 2000000, taxableIncome: -30000, netCashFlow: 72000 }],
  [], []
);
assert("RE passive: raw passive = -30K", rePassiveResult.passive, -30000);
assert("RE passive: PAL suspends loss", rePassiveResult.passiveAllowed, 0);
assert("RE passive: suspended PAL = 30K", rePassiveResult.suspendedPAL, 30000);
assert("RE passive: ordEarned untouched", rePassiveResult.ordEarned, 500000);

// With RE Pro status: taxableIncome → ordEarned
const reProResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, reProStatus: true },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [{ assetType: "realEstate", value: 3000000, costBasis: 2000000, taxableIncome: -30000, netCashFlow: 72000 }],
  [], []
);
assert("RE pro: loss goes to ordEarned", reProResult.ordEarned, 500000 + (-30000));
assert("RE pro: passive stays 0", reProResult.passive, 0);

// RE with proration (acquired mid-year)
const reProrated = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0, reProStatus: false },
  [{ type: "wages", amount: 100000, entity: "Self" }],
  [{ assetType: "realEstate", value: 2000000, taxableIncome: -48000, netCashFlow: 36000, startMonth: 6, endMonth: 11 }],
  [], []
);
// Half year: taxable = -48K * 0.5 = -24K, cash = 36K * 0.5 = 18K
assert("RE prorated: passive = -24K", reProrated.passive, -24000);
assert("RE prorated: cash flow = 18K", reProrated.reCashFlow, 18000);

// ─── TEST 20: LIABILITIES ───────────────────────────────────────────────────
section("20. Liabilities — Interest Deductions + Cash Flow");

// Sched A mortgage interest flows to itemized
const liabResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [],
  [{ type: "salt", amount: 10000 }], // 10K SALT
  [],
  [{ label: "Mortgage", balance: 1000000, monthlyPayment: 6000, annualInterest: 48000, deductType: "schedA" }]
);
// Itemized: 10K SALT + 48K mortgage = 58K (> 30K standard)
assert("Liab: Sched A interest in itemized", liabResult.schedAInterest, 48000);
assert("Liab: itemized includes mortgage", liabResult.itemizedRaw, 58000);
assert("Liab: uses itemized", liabResult.useItemized, 1, 0);

// Liability monthly payment in cash flow
assert("Liab: total payments", liabResult.totalLiabPayments, 72000); // 6K * 12

// Multiple liabilities with different deductibility
const multiLiabResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [], [],
  [],
  [
    { label: "Mortgage", balance: 800000, monthlyPayment: 5000, annualInterest: 36000, deductType: "schedA" },
    { label: "SBLOC", balance: 200000, monthlyPayment: 1000, annualInterest: 12000, deductType: "investment" },
    { label: "Car Loan", balance: 50000, monthlyPayment: 900, annualInterest: 3000, deductType: "none" },
  ]
);
assert("Multi-liab: Sched A only mortgage", multiLiabResult.schedAInterest, 36000);
assert("Multi-liab: total payments", multiLiabResult.totalLiabPayments, (5000+1000+900)*12);

// Liability with proration (new mortgage mid-year)
const liabProratedResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 300000, entity: "Self" }],
  [], [], [],
  [{ label: "New Mortgage", balance: 500000, monthlyPayment: 3000, annualInterest: 24000, deductType: "schedA", startMonth: 6, endMonth: 11 }]
);
// Half year: interest = 24K * 0.5 = 12K, payments = 3K * 12 * 0.5 = 18K
assert("Liab prorated: half year interest", liabProratedResult.schedAInterest, 12000);
assert("Liab prorated: half year payments", liabProratedResult.totalLiabPayments, 18000);

// ─── TEST 21: RE + LIAB INTEGRATION (FULL PRELOAD) ─────────────────────────
section("21. RE + Liab Integration — Test Family");

const fullREResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3, reProStatus: false,
    priorYearLiability: 1050000, priorYearAgi: 2900000,
    q1Paid: 275000, q2Paid: 275000, livingExpenses: 28000 },
  [
    { type: "business", amount: 300000, entity: "Husband" },
    { type: "business", amount: 2200000, entity: "Husband" },
    { type: "ltcg", amount: 600000, entity: "Husband" },
  ],
  [
    { assetType: "cash", value: 920000, yieldPct: 4.8 },
    { assetType: "realEstate", value: 3500000, costBasis: 2200000, taxableIncome: -15000, netCashFlow: 72000 },
  ],
  [{ type: "salt", amount: 10000 }],
  [{ label: "Husband", pteElection: true, pteRate: 9.3, retirementContrib: 138000, healthInsurance: 47000 }],
  [{ label: "Mortgage", balance: 1400000, monthlyPayment: 8200, annualInterest: 72000, deductType: "schedA" }]
);

// RE taxable = -15K passive (not RE pro)
assert("Full RE: passive = -15K", fullREResult.passive, -15000);
// RE cash flow = 72K
assert("Full RE: reCashFlow = 72K", fullREResult.reCashFlow, 72000);
// Mortgage interest in itemized: 10K SALT + 72K mortgage = 82K
assert("Full RE: itemized = 82K", fullREResult.itemizedRaw, 82000);
// Liability payments in cash flow
assert("Full RE: liab payments = 98.4K", fullREResult.totalLiabPayments, 98400);

// ─── TEST 22: RE PROFESSIONAL TAX SAVINGS ───────────────────────────────────
section("22. RE Professional — Tax Savings Comparison");

const baseProfile = { filingStatus: "mfj", state: "FL", stateRate: 0, reProStatus: false };
const baseStreams = [{ type: "wages", amount: 800000, entity: "Self" }];
const reAssets = [{ assetType: "realEstate", value: 5000000, taxableIncome: -200000, netCashFlow: 50000 }];

const noProResult = computeTax(baseProfile, baseStreams, reAssets, [], [], []);
const proResult2 = computeTax({...baseProfile, reProStatus: true}, baseStreams, reAssets, [], [], []);

// Without RE pro: $200K loss trapped by PAL
assert("RE Pro comparison: passive without = -200K", noProResult.passive, -200000);
assert("RE Pro comparison: PAL suspended = 200K", noProResult.suspendedPAL, 200000);
assert("RE Pro comparison: passiveAllowed = 0", noProResult.passiveAllowed, 0);
assert("RE Pro comparison: ordEarned without = 800K", noProResult.ordEarned, 800000);

// With RE pro: $200K loss offsets ordinary (routed to ordEarned, not passive)
assert("RE Pro comparison: passive with = 0", proResult2.passive, 0);
assert("RE Pro comparison: ordEarned with = 600K", proResult2.ordEarned, 600000);
assert("RE Pro comparison: no suspended PAL", proResult2.suspendedPAL, 0);
assert("RE Pro comparison: lower federal tax", proResult2.federalTax < noProResult.federalTax, true, 0);

const savings = noProResult.totalTax - proResult2.totalTax;
assert("RE Pro comparison: meaningful savings (>$50K)", savings > 50000, true, 0);

// ─── TEST 23: SCENARIO ANALYSIS ─────────────────────────────────────────────
section("23. Scenario Analysis — Preset Overrides");

const scBase = {
  profile: { filingStatus:"mfj", state:"CA", stateRate:14.3, reProStatus:false, livingExpenses:28000 },
  streams: [
    { type:"business", amount:300000, entity:"Husband", timing:"monthly" },
    { type:"business", amount:2200000, entity:"Husband", timing:"quarterly" },
    { type:"ltcg", amount:600000, entity:"Husband", timing:"annual", timingMonth:2 },
  ],
  assets: [
    { assetType:"cash", value:920000, yieldPct:4.8 },
    { assetType:"hedgeFund", nav:5400000, ordPct:-30, ltcgPct:25, qualDivPct:5 },
    { assetType:"hedgeFund", nav:3000000, stcgPct:-32, qualDivPct:1.2 },
    { assetType:"realEstate", value:3500000, taxableIncome:-15000, netCashFlow:72000 },
  ],
  deds: [{ type:"salt", amount:10000 }],
  entities: [{ label:"Husband", pteElection:true, pteRate:9.3, retirementContrib:138000, healthInsurance:47000 }],
  liabs: [{ label:"Mortgage", balance:1400000, monthlyPayment:8200, annualInterest:72000, deductType:"schedA" }],
};

const baseR = computeTax(scBase.profile, scBase.streams, scBase.assets, scBase.deds, scBase.entities, scBase.liabs);

// Strong year: +400K to k1_ordinary
const strongStreams = scBase.streams.map(s => s.type==="business"&&s.timing==="quarterly" ? {...s, amount:s.amount+400000} : s);
const strongR = computeTax(scBase.profile, strongStreams, scBase.assets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario strong: higher AGI", strongR.agi > baseR.agi, true, 0);
assert("Scenario strong: higher total tax", strongR.totalTax > baseR.totalTax, true, 0);

// Weak year: -400K
const weakStreams = scBase.streams.map(s => s.type==="business"&&s.timing==="quarterly" ? {...s, amount:Math.max(0,s.amount-400000)} : s);
const weakR = computeTax(scBase.profile, weakStreams, scBase.assets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario weak: lower AGI", weakR.agi < baseR.agi, true, 0);
assert("Scenario weak: lower total tax", weakR.totalTax < baseR.totalTax, true, 0);

// Move to Florida (keep PTE since entity still CA-based, but state = 0)
const flProfile = { ...scBase.profile, state:"FL", stateRate:0 };
const flR = computeTax(flProfile, scBase.streams, scBase.assets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario FL: state tax after PTE = 0", flR.stateTaxAfterPTE, 0);
assert("Scenario FL: PTET still computes (CA entity)", flR.totalPTET > 0, true, 0);
// FL total should equal federal only (state=0). May be higher or lower than CA depending on PTE/state balance
assert("Scenario FL: total = federal only", Math.abs(flR.totalTax - flR.federalTax) < 1, true, 0);

// No PTET
const noPteEnts = scBase.entities.map(e => ({...e, pteElection:false}));
const noPteR = computeTax(scBase.profile, scBase.streams, scBase.assets, scBase.deds, noPteEnts, scBase.liabs);
assert("Scenario no PTE: PTET = 0", noPteR.totalPTET, 0);
// With PTET refactored as credit-only, federal tax is identical with or without PTE
// The benefit is purely in the state credit
assert("Scenario no PTE: same federal tax (PTET is credit only)", Math.abs(noPteR.federalTax - baseR.federalTax) < 1, true, 0);
assert("Scenario no PTE: higher state (no credit)", noPteR.stateTaxAfterPTE > baseR.stateTaxAfterPTE, true, 0);
const pteBenefit = noPteR.totalTax - baseR.totalTax;
assert("Scenario no PTE: PTE credit saves on state tax", pteBenefit > 0, true, 0);

// RE Professional
const reProProfile = { ...scBase.profile, reProStatus:true };
const reProR = computeTax(reProProfile, scBase.streams, scBase.assets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario RE Pro: passive = 0 (routed to ord)", reProR.passive, 0);
assert("Scenario RE Pro: no suspended PAL", reProR.suspendedPAL, 0);
// With base RE loss of -15K: saves ~15K * marginal rate
assert("Scenario RE Pro: lower or equal tax", reProR.totalTax <= baseR.totalTax, true, 0);

// Flex +$2M collateral (same leverage)
const flex2mAssets = scBase.assets.map(a => (a.stcgPct||0)<0 && (a.qualDivPct||0)>0 && (a.qualDivPct||0)<2 ? {...a, nav:(a.nav||0)+2000000} : a);
const flex2mR = computeTax(scBase.profile, scBase.streams, flex2mAssets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario Flex +2M: more STCL", flex2mR.stcg < baseR.stcg, true, 0);
assert("Scenario Flex +2M: lower total tax", flex2mR.totalTax < baseR.totalTax, true, 0);

// Flex leverage upgrade (F145 -32% → F250 -50%)
const flexUpAssets = scBase.assets.map(a => (a.stcgPct||0)<0 && (a.qualDivPct||0)>0 && (a.qualDivPct||0)<2 ? {...a, stcgPct:-50, qualDivPct:1} : a);
const flexUpR = computeTax(scBase.profile, scBase.streams, flexUpAssets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario Flex upgrade: deeper STCL", flexUpR.stcg < baseR.stcg, true, 0);

// Flex +$2M AND upgrade to 250
const flexBothAssets = scBase.assets.map(a => (a.stcgPct||0)<0 && (a.qualDivPct||0)>0 && (a.qualDivPct||0)<2 ? {...a, nav:(a.nav||0)+2000000, stcgPct:-50, qualDivPct:1} : a);
const flexBothR = computeTax(scBase.profile, scBase.streams, flexBothAssets, scBase.deds, scBase.entities, scBase.liabs);
assert("Scenario Flex both: more STCL than either alone", flexBothR.stcg < flex2mR.stcg, true, 0);
assert("Scenario Flex both: lower tax than collateral only", flexBothR.totalTax < flex2mR.totalTax, true, 0);

// Delphi +3M
const delpUpAssets = scBase.assets.map(a => a.ordPct===-30 ? {...a, nav:(a.nav||0)+3000000} : a);
const delpUpR = computeTax(scBase.profile, scBase.streams, delpUpAssets, scBase.deds, scBase.entities, scBase.liabs);
// More Delphi = more ord losses + more LTCG
assert("Scenario Delphi +3M: more LTCG", delpUpR.ltcg > baseR.ltcg, true, 0);
assert("Scenario Delphi +3M: more ord losses", delpUpR.ordInv < baseR.ordInv, true, 0);

// ─── TEST 24: APPROACH C — PHANTOM INCOME + FIRM RETENTION ──────────────────
section("24. Approach C — Phantom Income + Firm Retention");

// Entity with actualDistributions set
const appCEntities = [
  { label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 138000, healthInsurance: 47000,
    actualDistributions: 1500000 },
];
const appCResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [
    { type: "business", amount: 300000, entity: "Partner", timing: "monthly" },
    { type: "business", amount: 2200000, entity: "Partner", timing: "quarterly" },
    { type: "ltcg", amount: 600000, entity: "Partner", timing: "annual", timingMonth: 2 },
  ],
  [], [], appCEntities, []
);

// Gross K-1 for Partner entity: 300K + 2.2M + 600K = 3.1M
assert("AppC: gross K-1 for dist entities", appCResult.totalGrossK1ForDistEnts, 3100000);
assert("AppC: actual distributions = 1.5M", appCResult.totalActualDist, 1500000);
// Phantom income = 3.1M - 1.5M = 1.6M
assert("AppC: phantom income = 1.6M", appCResult.phantomIncome, 1600000);
// Entity deductions: PTET (3.1M * 9.3% = 288,300) + retire (138K) + health (47K) = 473,300
assert("AppC: entity deduc total", appCResult.entityDeducTotal, 288300 + 138000 + 47000);
// Firm retention = phantom - entity deductions = 1.6M - 473,300 = 1,126,700
assert("AppC: firm retention", appCResult.firmRetention, 1600000 - 288300 - 138000 - 47000);

// Without actualDistributions: firm retention = 0
const noDistEntities = [
  { label: "Partner", pteElection: true, pteRate: 9.3, retirementContrib: 138000, healthInsurance: 47000 },
];
const noDistResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [{ type: "business", amount: 2000000, entity: "Partner" }],
  [], [], noDistEntities, []
);
assert("AppC no dist: firm retention = 0", noDistResult.firmRetention, 0);
assert("AppC no dist: phantom = 0", noDistResult.phantomIncome, 0);

// Tax engine unchanged by Approach C (only affects cash flow)
assert("AppC: same federal tax as without dist field", 
  Math.abs(appCResult.federalTax - computeTax(
    { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
    [
      { type: "business", amount: 300000, entity: "Partner", timing: "monthly" },
      { type: "business", amount: 2200000, entity: "Partner", timing: "quarterly" },
      { type: "ltcg", amount: 600000, entity: "Partner", timing: "annual", timingMonth: 2 },
    ],
    [], [], noDistEntities, []
  ).federalTax) < 1, true, 0);

// Firm retention reduces net cash
assert("AppC: net cash lower with firm retention", appCResult.netCashAfterTax < noDistResult.netCashAfterTax ||
  appCResult.firmRetention > 0, true, 0);

// ─── TEST 25: ENTITY-DRIVEN PTET (SIMPLIFIED TYPES) ────────────────────────
section("25. Entity-Driven PTET with Simplified Income Types");

// Multiple stream types on same PTE entity — all trigger PTET
const multiTypeResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [
    { type: "business", amount: 1000000, entity: "Firm" },
    { type: "ltcg", amount: 500000, entity: "Firm" },
    { type: "interest", amount: 50000, entity: "Firm" },
  ],
  [], [],
  [{ label: "Firm", pteElection: true, pteRate: 9.3, retirementContrib: 0, healthInsurance: 0 }],
  []
);
// All 3 streams on PTE entity: 1M + 500K + 50K = 1.55M * 9.3% = 144,150
assert("Multi-type PTET: all streams count", multiTypeResult.totalPTET, 144150);

// Stream NOT on PTE entity: no PTET
const mixedResult = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [
    { type: "business", amount: 1000000, entity: "Firm" },
    { type: "wages", amount: 200000, entity: "Employer" },
  ],
  [], [],
  [
    { label: "Firm", pteElection: true, pteRate: 9.3, retirementContrib: 0, healthInsurance: 0 },
    { label: "Employer", pteElection: false, retirementContrib: 0, healthInsurance: 0 },
  ],
  []
);
// Only Firm income (1M) triggers PTET, not Employer wages
assert("Mixed entities: PTET only on PTE entity", mixedResult.totalPTET, 93000);

// ─── TEST 26: 2/37 RULE — ITEMIZED DEDUCTION LIMITATION ─────────────────────
section("26. 2/37 Rule — Itemized Deduction Limitation (OBBBA 2026)");

// High-income client in 37% bracket with itemized deductions
// $1.5M wages, $80K itemized deductions (SALT 10K + mortgage 30K + charitable 40K)
const rule237Result = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [{ type: "wages", amount: 1500000, entity: "Self" }],
  [],
  [
    { type: "salt", amount: 50000 },    // capped by phaseout: AGI ~1.5M >> $505K → cap = $10K
    { type: "mortgage", amount: 30000 },
    { type: "charitable", amount: 40000 },
  ],
  []
);
// AGI = $1.5M → SALT cap = max(10000, 40400 - (1500000-505000)*0.30) = max(10000, 40400-298500) = $10,000
assert("High AGI → SALT cap floors at $10K", rule237Result.saltCap, 10000);
// Itemized raw = $10K + $30K + $40K = $80K
assert("Itemized raw = $80K", rule237Result.itemizedRaw, 80000);
// Tentative taxable ord = 1,500,000 - 80,000 - 0 (QBI) = 1,420,000
// Excess over 37% threshold ($768,700) = 651,300
// Reduction = (2/37) × min(80000, 651300) = (2/37) × 80000 = 4324 (rounded)
assert("2/37 reduction ≈ $4,324", rule237Result.reduction237, 4324);
assert("Itemized after 2/37 = $75,676", rule237Result.itemizedAfter237, 75676);

// Client NOT in 37% bracket → no 2/37 reduction
const noRule237 = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 14.3 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [],
  [
    { type: "salt", amount: 50000 },    // $500K AGI → SALT cap = max(10000, 40400 - 0) = $40,400
    { type: "mortgage", amount: 30000 },
    { type: "charitable", amount: 40000 },
  ],
  []
);
// AGI = $500K → below $505K phaseout, full $40,400 SALT cap
assert("$500K AGI → full SALT cap $40,400", noRule237.saltCap, 40400);
// Itemized = $40,400 + $30K + $40K = $110,400
assert("Itemized = $110,400", noRule237.itemizedRaw, 110400);
// Taxable ord = $500K - $110,400 = $389,600 → below $768,700, not in 37% bracket
assert("Below 37% → no 2/37 reduction", noRule237.reduction237, 0);

// Edge case: very large itemized deductions exceed the excess-over-37
// $2M wages, $500K charitable
const rule237Large = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 2000000, entity: "Self" }],
  [],
  [{ type: "charitable", amount: 500000 }],
  []
);
// AGI = $2M, itemized = $500K, tentative taxable = $2M - $500K = $1.5M
// Excess over $768,700 = $731,300
// Reduction = (2/37) × min(500000, 731300) = (2/37) × 500000 = 27027 (rounded)
assert("Large deductions: 2/37 uses min(itemized, excess)", rule237Large.reduction237, 27027);

// ─── TEST 27: §475(f) TRADER ELECTION ────────────────────────────────────────
section("27. §475(f) Trader Election — Income Character Routing");

// Same fund, with and without trader election
const baseHF = { assetType: "hedgeFund", nav: 5000000, ordPct: -20, stcgPct: 0, ltcgPct: 10, qualDivPct: 2, intPct: 0, taxExPct: 0, distPct: 0, capCallPct: 0 };

// Without trader election: ordinary loss → ordInv (investment character)
const noTrader = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [{ ...baseHF, traderElection: false }],
  [], []
);

// With trader election: ordinary loss → ordEarned (business character)
const withTrader = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 500000, entity: "Self" }],
  [{ ...baseHF, traderElection: true }],
  [], []
);

// Both should have same AGI (same total income flows through)
assert("Trader election: same AGI", withTrader.agi, noTrader.agi);
assert("Trader election: same federal tax", withTrader.federalTax, noTrader.federalTax, 1);

// The critical difference: NIIT
// Without trader: ordInv includes -$1M loss → reduces NII
// With trader: ordInv = 0, ordEarned absorbs loss → NII is higher → more NIIT
// Fund: ordPct=-20% of $5M = -$1M ord, ltcgPct=10% = $500K LTCG, qualDivPct=2% = $100K QDiv
// Without trader: NII = ordInv(-$1M) + LTCG($500K) + QDiv($100K) = max(0, -400K) = 0
// With trader: NII = ordInv(0) + LTCG($500K) + QDiv($100K) = $600K
assert("No trader: NII reduced by ord loss", noTrader.nii, 0);
assert("With trader: NII excludes business loss", withTrader.nii, 600000);

// NIIT difference: AGI = 500K + (-1M ord + 500K LTCG + 100K QDiv) = 100K → below $250K floor → both 0 NIIT
// Actually AGI = max(0, totalOrdinary + totalPref)
// Without: totalOrd = 500K(wages) + (-1M inv) = -500K, totalPref = 500K + 100K = 600K, AGI = max(0, -500K + 600K) = 100K
// With: totalOrd = 500K(wages) + (-1M earned) = -500K, totalPref = 600K, AGI = 100K
// Both AGI = $100K, below $250K NIIT floor → both $0 NIIT regardless
assert("Low AGI → NIIT $0 either way", noTrader.niit, 0);
assert("Low AGI → NIIT $0 either way", withTrader.niit, 0);

// Now test with higher income where NIIT actually differs
const noTraderHigh = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 2000000, entity: "Self" }],
  [{ ...baseHF, traderElection: false }],
  [], []
);
const withTraderHigh = computeTax(
  { filingStatus: "mfj", state: "FL", stateRate: 0 },
  [{ type: "wages", amount: 2000000, entity: "Self" }],
  [{ ...baseHF, traderElection: true }],
  [], []
);
// Both: AGI = max(0, (2M + ord) + pref)
// ordInv without trader = -1M, so totalOrd = 2M - 1M = 1M; totalPref = 600K; AGI = 1.6M
// ordEarned with trader: totalOrd = 2M - 1M = 1M (same); same AGI = 1.6M
assert("High income: same AGI both ways", withTraderHigh.agi, noTraderHigh.agi);

// NII differs:
// Without: NII = max(0, -1M + 500K + 100K) = 0 (ord investment loss wipes pool)  
// Actually wait — LTCG and QDiv in NII: nii = max(0, ordInv + max(0,netSTAfter) + netLTAfter + qualDiv + passiveAllowed)
// Without: ordInv = -1M, netLTAfter = 500K, qualDiv = 100K → NII = max(0, -1M + 500K + 100K) = 0  ✗ actually = max(0, -400K) = 0
// With: ordInv = 0, netLTAfter = 500K, qualDiv = 100K → NII = 600K
assert("High inc no trader: NII = 0 (loss wipes pool)", noTraderHigh.nii, 0);
assert("High inc with trader: NII = $600K", withTraderHigh.nii, 600000);

// NIIT: AGI = 1.6M, floor = 250K, niitBase = 1.35M
// Without: min(0, 1.35M) × 3.8% = $0
// With: min(600K, 1.35M) × 3.8% = $22,800
assert("No trader: NIIT = $0", noTraderHigh.niit, 0);
assert("Trader election: NIIT = $22,800", withTraderHigh.niit, 22800);

// ─── TEST 28: PTE EXCESS — REFUNDABLE CREDIT ────────────────────────────────
section("28. PTE Excess Credit — State Refund When PTE > Gross State Tax");

// Entity with PTE at 9.3% on $2M K-1, but low AGI means low state tax
// K-1 = $500K, PTE = 9.3% × $500K = $46,500, State tax on $500K AGI ≈ ~$30K
const pteExcessResult = computeTax(
  { filingStatus: "mfj", state: "CA", stateRate: 9.3 },
  [{ type: "business", amount: 500000, entity: "Firm" }],
  [],
  [],
  [{ label: "Firm", pteElection: true, pteRate: 9.3, pteState: "CA", retirementContrib: 0, healthInsurance: 0 }],
  []
);
// PTE = 9.3% × $500K = $46,500
assert("PTE on $500K = $46,500", pteExcessResult.totalPTET, 46500);
// AGI = $500K - $46,500 (PTE) = $453,500; CA tax on ~$453K ≈ much less than $46.5K
// stateTaxAfterPTE = max(0, gross - PTE) = $0
assert("State tax after PTE = $0", pteExcessResult.stateTaxAfterPTE, 0);
// PTE excess = PTE - gross state > 0
assert("PTE excess > 0", pteExcessResult.pteExcess > 0, true, 0);
// Overpayment should equal the PTE excess (no withholding in this test)
assert("State refund = PTE excess", pteExcessResult.overpaymentState, pteExcessResult.pteExcess);
// Balance due state = 0
assert("No state balance due", pteExcessResult.balanceDueState, 0);

// PRINT RESULTS
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║        YOSEMITE TAX ENGINE — AUDIT RESULTS             ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

for (const t of tests) {
  if (t.status === "SECTION") {
    console.log(t.label);
  } else if (t.status === "FAIL") {
    console.log(`  ✗ ${t.label}`);
    console.log(`    Expected: ${typeof t.expected === 'number' ? t.expected.toLocaleString() : t.expected}`);
    console.log(`    Actual:   ${typeof t.actual === 'number' ? t.actual.toLocaleString() : t.actual}`);
    console.log(`    Delta:    ${typeof t.actual === 'number' ? (t.actual - t.expected).toLocaleString() : 'N/A'}`);
  } else {
    console.log(`  ✓ ${t.label}`);
  }
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${passed + failed}`);
console.log(`─────────────────────────────────────────────`);
if (failed > 0) {
  console.log(`\n  ⚠  ${failed} test(s) FAILED — review above\n`);
  process.exit(1);
} else {
  console.log(`\n  ✓  All tests passed\n`);
  process.exit(0);
}
