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
  wages:     {label:"Wages / Salary",          char:"ordEarned", color:C.blue,   desc:"W-2 employment wages, bonus, RSU vest"},
  business:  {label:"Business Income",         char:"ordEarned", color:C.blue,   desc:"K-1 guaranteed payments, profit allocations, self-employment"},
  interest:  {label:"Interest Income",         char:"ordInv",    color:C.cyan,   desc:"Savings, CDs, money market, NPC ordinary"},
  qualDiv:   {label:"Qualified Dividends",     char:"qualDiv",   color:C.green,  desc:"Equity dividends, fund qualified distributions"},
  nonQualDiv:{label:"Non-Qualified Dividends", char:"ordInv",    color:C.cyan,   desc:"REIT, money market distributions"},
  stcg:      {label:"Short-Term Capital Gain", char:"stcg",      color:C.orange, desc:"Held under 1 year, nets against losses"},
  ltcg:      {label:"Long-Term Capital Gain",  char:"ltcg",      color:C.green,  desc:"Held over 1 year, carried interest"},
  passive:   {label:"Rental / Passive",        char:"passive",   color:C.purple, desc:"Rental income, passive K-1 activities"},
  taxExempt: {label:"Municipal / Tax-Exempt",  char:"taxExempt", color:C.teal,   desc:"Muni bond interest, exempt income"},
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

function computeTax(profile, streams, assets, deductions, entities, liabilities) {
  const p = TAX_PARAMS[profile.filingStatus] || TAX_PARAMS.mfj;

  // Build entity lookup by label
  const entMap = {};
  (entities||[]).forEach(e => { entMap[e.label] = e; });

  // Step 1: Aggregate income by six characters + withholding
  let ordEarned=0, ordInv=0, stcg=0, ltcg=0, qualDiv=0, passive=0, taxExempt=0;
  let totalFedWithholding=0, totalStateWithholding=0;

  // Track K-1 income per entity for PTET computation
  const k1ByEntity = {};
  streams.forEach(s => {
    const t = INCOME_TYPES[s.type];
    if (!t) return;
    const pf = proFactor(s);
    const a = (s.amount || 0) * pf;
    if (t.char==="ordEarned") ordEarned+=a;
    else if (t.char==="ordInv") ordInv+=a;
    else if (t.char==="stcg") stcg+=a;
    else if (t.char==="ltcg") ltcg+=a;
    else if (t.char==="qualDiv") qualDiv+=a;
    else if (t.char==="passive") passive+=a;
    else if (t.char==="taxExempt") taxExempt+=a;
    // Withholding (stream-level, for W-2 etc.)
    totalFedWithholding += a * (s.fedWithholdingPct||0) / 100;
    totalStateWithholding += a * (s.stateWithholdingPct||0) / 100;
    // Track income by entity for entity-level deductions (PTET, retirement, health)
    if (s.entity && entMap[s.entity]) {
      const ent = entMap[s.entity];
      if (ent.pteElection || (ent.retirementContrib||0)>0 || (ent.healthInsurance||0)>0) {
        k1ByEntity[s.entity] = (k1ByEntity[s.entity]||0) + a;
      }
    }
  });

  // From assets (with proration) + RE income routing
  let invDistributions=0, invCapCalls=0, reCashFlow=0;
  assets.forEach(item => {
    const at = item.assetType;
    const pf = proFactor(item);
    if (at==="cash") {
      ordInv += (item.value||0) * (item.yieldPct||0) / 100 * pf;
    } else if (at==="security") {
      qualDiv += (item.value||0) * (item.divYieldPct||0) / 100 * pf;
      ltcg += (item.value||0) * (item.realizedGainPct||0) / 100 * pf;
    } else if (at==="hedgeFund" || at==="peFund") {
      const nav = item.nav || 0;
      ordInv     += nav * (item.ordPct || 0) / 100 * pf;
      stcg       += nav * (item.stcgPct || 0) / 100 * pf;
      ltcg       += nav * (item.ltcgPct || 0) / 100 * pf;
      qualDiv    += nav * (item.qualDivPct || 0) / 100 * pf;
      ordInv     += nav * (item.intPct || 0) / 100 * pf;
      taxExempt  += nav * (item.taxExPct || 0) / 100 * pf;
      invDistributions += nav * (item.distPct || 0) / 100 * pf;
      invCapCalls += (item.unfunded||0) * (item.capCallPct || 0) / 100 * pf;
    } else if (at==="realEstate") {
      const reTax = (item.taxableIncome||0) * pf;
      reCashFlow += (item.netCashFlow||0) * pf;
      if (profile.reProStatus) { ordEarned += reTax; } else { passive += reTax; }
    }
  });

  // Step 1b: Entity-level pre-tax deductions
  let totalPTET=0, totalRetirement=0, totalHealthIns=0;
  const pteDetails = [];
  Object.entries(k1ByEntity).forEach(([entityLabel, k1Income]) => {
    const ent = entMap[entityLabel];
    if (!ent) return;
    // PTET
    if (ent.pteElection && (ent.pteRate||0) > 0) {
      const pteAmt = Math.abs(k1Income) * (ent.pteRate/100);
      totalPTET += pteAmt;
      pteDetails.push({entity:entityLabel, income:k1Income, rate:ent.pteRate, amount:pteAmt, state:ent.pteState||profile.state});
    }
    // Retirement contributions (reduce K-1 ordinary income)
    if ((ent.retirementContrib||0) > 0) totalRetirement += ent.retirementContrib;
    // Health insurance (above-the-line deduction)
    if ((ent.healthInsurance||0) > 0) totalHealthIns += ent.healthInsurance;
  });

  // Apply pre-tax deductions: PTET + retirement reduce earned income
  // PTET is a partnership-level deduction that reduces K-1 income before the 1040
  // Retirement contributions reduce K-1 ordinary income
  const preTaxDeductions = totalPTET + totalRetirement;
  ordEarned = ordEarned - preTaxDeductions;

  // PTET generates a state tax credit (dollar for dollar)
  // Health insurance is an above-the-line deduction (self-employed health)

  // Step 1c: Approach C — actual distributions vs. gross K-1
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
  // firmRetention = what the firm keeps beyond the entity deductions we already model
  // If actualDist is set, CF should use it instead of gross-minus-deductions
  const firmRetention = totalActualDist > 0 ? Math.max(0, phantomIncome - entityDeducTotal) : 0;

  // Step 1d: Liability interest deductions
  let schedAInterest=0, totalLiabPayments=0;
  (liabilities||[]).forEach(l => {
    const lpf = proFactor(l);
    const ai = (l.annualInterest||0) * lpf;
    totalLiabPayments += (l.monthlyPayment||0) * 12 * lpf;
    if (l.deductType==="schedA") schedAInterest += ai;
    // schedE interest already in RE taxableIncome; investment interest handled at NII
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

  // Step 3: Passive Activity Loss (PAL) limitation
  // Without RE Pro: passive losses are suspended (cannot offset non-passive income)
  // With RE Pro: rental losses are non-passive (already routed to ordEarned above)
  let passiveAllowed = passive;
  let suspendedPAL = 0;
  if (!profile.reProStatus && passive < 0) {
    // $25K allowance for active participation if AGI < $100K (phased out $100-150K)
    // For HNW clients this is always fully phased out, so suspended = full loss
    passiveAllowed = 0;
    suspendedPAL = Math.abs(passive);
  }

  // Step 4: Taxable income
  // Health insurance is above-the-line (reduces AGI)
  const totalOrdinary = ordEarned + ordInv + passiveAllowed + netSTAfter - capitalLossOffset - totalHealthIns;
  const totalPref = netLTAfter + qualDiv;
  const agi = Math.max(0, totalOrdinary + totalPref);

  // QBI
  const qbiBase = streams.filter(s => s.qbi).reduce((t, s) => t + (s.amount||0), 0) * 0.20;
  let qbiDeduction = 0;
  if (agi <= p.qbiLow) qbiDeduction = Math.min(qbiBase, Math.max(0,totalOrdinary)*0.20);
  else if (agi < p.qbiHigh) { const frac = 1-(agi-p.qbiLow)/(p.qbiHigh-p.qbiLow); qbiDeduction = Math.min(qbiBase*frac, Math.max(0,totalOrdinary)*0.20); }
  qbiDeduction = Math.max(0, qbiDeduction);

  const itemizedRaw = deductions.reduce((t,d) => d.type==="salt" ? t+Math.min(d.amount||0,10000) : t+(d.amount||0), 0) + schedAInterest;
  const useItemized = itemizedRaw > p.std;
  const deductionAmt = (useItemized ? itemizedRaw : p.std) + qbiDeduction;

  const taxableOrd = Math.max(0, totalOrdinary - deductionAmt);
  const taxablePref = Math.max(0, totalPref);

  // Step 4: Tax computation
  const ordTax = bracketTax(taxableOrd, p.brackets);
  const prefTax = ltcgStack(taxableOrd, taxablePref, p.ltcg);

  // Step 6: NIIT - ordEarned is EXCLUDED from NII; use passiveAllowed (suspended PAL excluded)
  const nii = Math.max(0, ordInv + Math.max(0,netSTAfter) + netLTAfter + qualDiv + passiveAllowed);
  const niitBase = Math.max(0, agi - p.niitFloor);
  const niit = Math.min(nii, niitBase) * 0.038;

  const federalTax = ordTax + prefTax + niit;
  const stateGross = Math.max(0, agi * ((profile.stateRate||0)/100) * 0.88);
  const stateTaxAfterPTE = Math.max(0, stateGross - totalPTET);
  const stateTax = stateGross; // gross liability before credit
  const totalTax = federalTax + stateTaxAfterPTE;

  const topBracket = p.brackets.slice().reverse().find(([,min]) => taxableOrd > min);
  const marginalOrd = topBracket ? topBracket[0]*100 : 10;
  const topPrefBr = p.ltcg.slice().reverse().find(([,min]) => (taxableOrd+taxablePref) > min);
  const marginalPref = topPrefBr ? topPrefBr[0]*100 : 0;

  // Safe harbor -- withholding + PTET count toward prepayment
  const priorY = profile.priorYearLiability||0;
  const priorAgi = profile.priorYearAgi||0;
  const safeHarborPY = priorY * (priorAgi>150000?1.10:1.00);
  const safeHarborCY = federalTax * 0.90;
  const safeHarborTarget = Math.min(safeHarborPY||Infinity, safeHarborCY);
  const totalEstPaid = (profile.q1Paid||0)+(profile.q2Paid||0)+(profile.q3Paid||0)+(profile.q4Paid||0);
  const totalPrepaid = totalFedWithholding + totalEstPaid;
  const remainingSH = safeHarborPY>0 ? Math.max(0,safeHarborTarget-totalPrepaid) : 0;
  const penaltyEst = remainingSH * 0.08;

  // Balance due
  const balanceDueFed = Math.max(0, federalTax - totalFedWithholding - totalEstPaid);
  const balanceDueState = Math.max(0, stateTaxAfterPTE - totalStateWithholding);
  const overpaymentFed = Math.max(0, totalFedWithholding + totalEstPaid - federalTax);
  const overpaymentState = Math.max(0, totalStateWithholding - stateTaxAfterPTE);

  // Net cash — pure cash-basis accounting
  // Step A: Cash from streams
  let streamCashIn = 0;
  streams.forEach(s => {
    const pf = proFactor(s);
    const ent = entMap[s.entity];
    if (ent?.actualDistributions > 0) return; // covered by actualDist
    const a = (s.amount||0) * pf;
    streamCashIn += a - a * ((s.fedWithholdingPct||0)+(s.stateWithholdingPct||0)) / 100;
  });
  // Step B: Cash from entities with actualDistributions (only if they have income streams)
  let distCashIn = 0;
  (entities||[]).forEach(e => { if ((e.actualDistributions||0) > 0 && k1ByEntity[e.label]) distCashIn += e.actualDistributions; });
  // Step C: Cash from assets (only actual cash, not phantom K-1 income)
  let assetCashIn = 0;
  assets.forEach(item => {
    const pf = proFactor(item);
    const at = item.assetType;
    if (at==="cash") assetCashIn += (item.value||0)*(item.yieldPct||0)/100*pf;
    else if (at==="security") assetCashIn += (item.value||0)*(item.divYieldPct||0)/100*pf; // divs are cash; realized gains only if sold
    else if (at==="realEstate") assetCashIn += (item.netCashFlow||0)*pf;
    // HF/PE: only distributions are cash (invDistributions already computed)
  });
  // Step D: Entity deductions for entities WITHOUT actualDist
  let entityDeducNonDist = 0;
  Object.entries(k1ByEntity).forEach(([entityLabel]) => {
    const ent = entMap[entityLabel];
    if (!ent || (ent.actualDistributions||0) > 0) return; // skip actualDist entities
    entityDeducNonDist += (ent.pteElection ? Math.abs(k1ByEntity[entityLabel]||0)*(ent.pteRate||0)/100 : 0)
      + (ent.retirementContrib||0) + (ent.healthInsurance||0);
  });

  const netCashAfterTax = streamCashIn + distCashIn + assetCashIn + invDistributions - invCapCalls
    - entityDeducNonDist - totalEstPaid - balanceDueFed - balanceDueState
    - (profile.livingExpenses||0)*12 - totalLiabPayments;

  const totalWithholding = totalFedWithholding + totalStateWithholding;

  const invOrdinary = assets.filter(a=>a.assetType==="hedgeFund"||a.assetType==="peFund").reduce((t,a) => t + (a.nav||0)*(a.ordPct||0)/100, 0);
  const ordLossBenefit = invOrdinary < 0 ? Math.abs(invOrdinary) * (marginalOrd/100) : 0;

  // Federal tax savings from PTET (the SALT workaround benefit)
  const pteFedSavings = totalPTET * (marginalOrd/100);

  return {
    ordEarned, ordInv, stcg, ltcg, qualDiv, passive, passiveAllowed, suspendedPAL, taxExempt,
    netST, netLT, netSTAfter, netLTAfter, capitalLossOffset, capitalLossCarry,
    invOrdinary,
    totalOrdinary, totalPref, agi,
    qbiDeduction, itemizedRaw, useItemized, deductionAmt,
    taxableOrd, taxablePref,
    ordTax, prefTax, niit, nii, federalTax, stateTax, stateTaxAfterPTE, totalTax,
    effectiveRate: agi>0 ? totalTax/agi*100 : 0,
    effectiveFederal: agi>0 ? federalTax/agi*100 : 0,
    marginalOrd, marginalPref,
    // Entity-level deductions
    totalPTET, pteDetails, pteFedSavings, totalRetirement, totalHealthIns, preTaxDeductions,
    // Approach C: actual distributions
    totalActualDist, totalGrossK1ForDistEnts, phantomIncome, firmRetention, entityDeducTotal,
    // Withholding
    totalFedWithholding, totalStateWithholding, totalWithholding,
    // Cash-basis fields
    streamCashIn, distCashIn, assetCashIn, entityDeducNonDist,
    // Safe harbor
    safeHarborPY, safeHarborCY, safeHarborTarget, totalEstPaid, totalPrepaid,
    remainingSH, penaltyEst,
    balanceDueFed, balanceDueState, overpaymentFed, overpaymentState,
    // Cash flow
    invDistributions, invCapCalls, invTaxExempt: taxExempt, reCashFlow,
    schedAInterest, totalLiabPayments,
    netCashAfterTax, ordLossBenefit,
    // Back-compat
    totalLTCG: totalPref, taxableLTCG: taxablePref, ltcgTax: prefTax, marginalLTCG: marginalPref,
    safeHarborMin: safeHarborTarget, totalPaid: totalEstPaid,
  };
}

// ─── BALANCE SHEET ENGINE ──────────────────────────────────────────────────
function computeBalanceSheet(assets, liabilities) {
  let tiers = {1:0,2:0,3:0,4:0,R:0};
  let totalAssets=0, totalBasis=0, totalEmbeddedGain=0, totalUnfunded=0;
  let fundCount=0, nonFundCount=0;

  assets.forEach(a => {
    const at = a.assetType;
    let val=0, basis=0;
    if (at==="cash") { val=a.value||0; basis=val; tiers[1]+=val; nonFundCount++; }
    else if (at==="security") { val=a.value||0; basis=a.costBasis||val; tiers[2]+=val; nonFundCount++; }
    else if (at==="hedgeFund") { val=a.nav||0; basis=a.adjBasis||a.costBasis||val; tiers[3]+=val; fundCount++; }
    else if (at==="peFund") { val=a.nav||0; basis=a.adjBasis||a.costBasis||val; tiers[4]+=val; totalUnfunded+=a.unfunded||0; fundCount++; }
    else if (at==="realEstate") { val=a.value||0; basis=a.costBasis||val; tiers[4]+=val; nonFundCount++; }
    else if (at==="retirement") { val=a.value||0; basis=0; tiers["R"]+=val; nonFundCount++; }
    totalAssets+=val; totalBasis+=basis; totalEmbeddedGain+=Math.max(0,val-basis);
  });

  const totalLiabilities = (liabilities||[]).reduce((t,l) => t + (l.balance||0), 0);
  const netWorth = totalAssets - totalLiabilities;
  const liquidNW = tiers[1] + tiers[2] - totalLiabilities;
  return { tiers, totalAssets, totalBasis, totalEmbeddedGain, totalUnfunded, totalLiabilities, netWorth, liquidNW, fundCount, nonFundCount };
}

// ─── MONTHLY CASH FLOW ENGINE ───────────────────────────────────────────────
function computeMonthlyCashflow(profile, streams, assets, result, liabilities, entities) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const qMap = {3:"q1Paid",5:"q2Paid",8:"q3Paid",0:"q4Paid"};
  const qDue = {3:"Apr 15",5:"Jun 15",8:"Sep 15",0:"Jan 15"};
  const livingExp = profile.livingExpenses || 0;

  // Build entity lookup
  const entMap = {};
  (entities||[]).forEach(e => { entMap[e.label] = e; });

  // Entities with actualDistributions: compute monthly distribution schedule
  // Only if the annual engine confirmed distributions (i.e., entity has income streams)
  const distSchedule = {};
  if ((result.distCashIn||0) > 0) {
    (entities||[]).forEach(e => {
      if ((e.actualDistributions||0) > 0) {
        const dMonths = e.distributionMonths || [2,5,8,11];
        const perMonth = e.actualDistributions / dMonths.length;
        dMonths.forEach(m => { distSchedule[m] = (distSchedule[m]||0) + perMonth; });
      }
    });
  }

  // Entity deductions for non-actualDist entities, prorated monthly
  const entDeducMonthly = (result.entityDeducNonDist||0) / 12;

  // Asset cash income per month (interest, dividends, RE cash flow)
  const assetCashMonthly = (result.assetCashIn||0) / 12;

  let cumulative = 0;
  return months.map((m, i) => {
    // Streams: only include if entity does NOT have actualDistributions
    let streamIn=0, withholding=0;
    streams.forEach(s => {
      if (!isActiveInMonth(s, i)) return;
      const ent = entMap[s.entity];
      if ((ent?.actualDistributions||0) > 0) return; // skip: covered by entity distributions
      const timing = s.timing || "monthly";
      let amt = 0;
      if (timing === "monthly") amt = (s.amount||0) / 12;
      else if (timing === "quarterly" && [2,5,8,11].includes(i)) amt = (s.amount||0) / 4;
      else if (timing === "annual" && i === (s.timingMonth ?? 11)) amt = s.amount||0;
      else if (timing === "semi" && [5,11].includes(i)) amt = (s.amount||0) / 2;
      streamIn += amt;
      withholding += amt * ((s.fedWithholdingPct||0) + (s.stateWithholdingPct||0)) / 100;
    });

    // Entity distributions (actual cash received from firms)
    const entDist = distSchedule[i] || 0;

    // Fund distributions (semi-annual Jun/Dec)
    let fundDist = 0;
    if ([5,11].includes(i)) fundDist = result.invDistributions / 2;

    const cashIn = streamIn - withholding + entDist + fundDist + assetCashMonthly;

    // Outflows
    let estPmt = 0;
    if (qMap[i] !== undefined) estPmt = profile[qMap[i]] || 0;

    let capCall = 0;
    if ([2,5,8,11].includes(i)) capCall = result.invCapCalls / 4;

    let liabPmt = 0;
    (liabilities||[]).forEach(l => { if (isActiveInMonth(l, i)) liabPmt += (l.monthlyPayment||0); });

    const net = cashIn - livingExp - liabPmt - estPmt - capCall - entDeducMonthly;
    cumulative += net;

    return { month:m, idx:i, cashIn, streamIn, withholding, entDist, fundDist, assetCash:assetCashMonthly,
      estPmt, livingExp, liabPmt, capCall, entDeduc:entDeducMonthly,
      net, cumulative, qDue:qDue[i] };
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

// ─── PRORATION HELPERS ──────────────────────────────────────────────────────
const isActiveInMonth = (item, month) => {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return month >= s && month <= e;
};
const proFactor = (item) => {
  const s = item.startMonth ?? 0;
  const e = item.endMonth ?? 11;
  return (e - s + 1) / 12;
};

const DEFAULT_PROFILE = {
  name: "", filingStatus: "mfj", state: "NY", stateRate: 10.9,
  priorYearLiability: 0, priorYearAgi: 0,
  q1Paid: 0, q2Paid: 0, q3Paid: 0, q4Paid: 0,
  livingExpenses: 0, reProStatus: false,
};

const TABS = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "balsheet", label: "Balance Sheet", icon: "#" },
  { id: "income", label: "Income", icon: "⟳" },
  { id: "deductions", label: "Deductions", icon: "§" },
  { id: "cashflow", label: "Cash Flow", icon: "⊞" },
  { id: "scenarios", label: "Scenarios", icon: "⊘" },
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

function NumInput({ value, onChange, prefix, style: sx = {}, ...rest }) {
  // Local string state for free-form editing; commit parsed number on blur/Enter
  const [raw, setRaw] = useState(null); // null = not editing
  const display = raw !== null ? raw : (value === 0 || value === null || value === undefined ? "" : String(value));
  const commit = (str) => {
    setRaw(null);
    const n = parseFloat(str);
    onChange({ target: { value: isNaN(n) ? 0 : n } });
  };
  return <div style={{ display: "flex", alignItems: "center", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 10px" }}>
    {prefix && <span style={{ fontSize: 11, color: C.textMuted, marginRight: 4 }}>{prefix}</span>}
    <input value={display} onChange={e => setRaw(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") commit(e.target.value); }}
      type="text" inputMode="decimal" {...rest}
      style={{ background: "none", border: "none", color: C.text, fontSize: 13, padding: "8px 0", outline: "none", width: "100%", fontFamily: "'IBM Plex Mono',monospace", ...sx }} />
  </div>;
}

function Input({ value, onChange, type = "text", prefix, style: sx = {}, ...rest }) {
  if (type === "number") return <NumInput value={value} onChange={onChange} prefix={prefix} style={sx} {...rest} />;
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
    id: uid(), type: "wages", label: "", amount: 0, timing: "monthly", timingMonth: 11,
    qbi: false, entity: "",
    fedWithholdingPct: 0, stateWithholdingPct: 0, startMonth: 0, endMonth: 11,
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
      <Field label="Federal W/H %"><Input value={s.fedWithholdingPct} onChange={e => upd("fedWithholdingPct", Number(e.target.value))} type="number" /></Field>
      <Field label="State W/H %"><Input value={s.stateWithholdingPct} onChange={e => upd("stateWithholdingPct", Number(e.target.value))} type="number" /></Field>
    </div>
    {/* Show note if entity has PTE election */}
    {(() => { const ent = (entities||[]).find(e => e.label === s.entity); return ent?.pteElection ? <div style={{ fontSize:10, color:C.accent, background:C.accent+"08", padding:"6px 10px", borderRadius:4 }}>
      {"PTE election active on "}{ent.label}{" at "}{ent.pteRate}{"% ("}{ent.pteState||"CA"}{")"}{" - state tax handled at entity level"}
    </div> : null; })()}
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
    {/* Proration */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, borderTop:`1px solid ${C.border}`, paddingTop:10, marginTop:8 }}>
      <Field label="Start Month"><Select value={s.startMonth??0} onChange={e => upd("startMonth", Number(e.target.value))}
        options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({value:i,label:m}))} /></Field>
      <Field label="End Month"><Select value={s.endMonth??11} onChange={e => upd("endMonth", Number(e.target.value))}
        options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({value:i,label:m}))} /></Field>
    </div>
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
    netCashFlow:0, taxableIncome:0, startMonth:0, endMonth:11,
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
        <Field label="Balance"><Input value={a.value} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Yield %"><Input value={a.yieldPct} onChange={e => upd("yieldPct", Number(e.target.value))} type="number" /></Field>
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
        <Field label="Current Value"><Input value={a.value} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Dividend Yield %"><Input value={a.divYieldPct} onChange={e => upd("divYieldPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Est. Realized Gain %"><Input value={a.realizedGainPct} onChange={e => upd("realizedGainPct", Number(e.target.value))} type="number" /></Field>
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
        <Field label="Current NAV"><Input value={a.nav} onChange={e => upd("nav", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Adj. Tax Basis"><Input value={a.adjBasis} onChange={e => upd("adjBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Field label="Unfunded"><Input value={a.unfunded} onChange={e => upd("unfunded", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Total Return %"><Input value={a.totalReturnPct} onChange={e => upd("totalReturnPct", Number(e.target.value))} type="number" /></Field>
        <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
          {gain > 0 && <div style={{ fontSize:11, color:C.orange, fontFamily:"'IBM Plex Mono',monospace" }}>Gain: {fmtD(gain, true)}</div>}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Mgmt Fee %"><Input value={a.mgmtFee} onChange={e => upd("mgmtFee", Number(e.target.value))} type="number" /></Field>
        <Field label="Perf Fee %"><Input value={a.perfFee} onChange={e => upd("perfFee", Number(e.target.value))} type="number" /></Field>
      </div>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {"Layer 2: Tax (Recognized % of NAV)"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <Field label="Ordinary %"><Input value={a.ordPct} onChange={e => upd("ordPct", Number(e.target.value))} type="number" /></Field>
        <Field label="STCG %"><Input value={a.stcgPct} onChange={e => upd("stcgPct", Number(e.target.value))} type="number" /></Field>
        <Field label="LTCG %"><Input value={a.ltcgPct} onChange={e => upd("ltcgPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Qual Div %"><Input value={a.qualDivPct} onChange={e => upd("qualDivPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Interest %"><Input value={a.intPct} onChange={e => upd("intPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Tax-Exempt %"><Input value={a.taxExPct} onChange={e => upd("taxExPct", Number(e.target.value))} type="number" /></Field>
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
        <Field label="Distribution % NAV"><Input value={a.distPct} onChange={e => upd("distPct", Number(e.target.value))} type="number" /></Field>
        <Field label="Cap Call % Unfunded"><Input value={a.capCallPct} onChange={e => upd("capCallPct", Number(e.target.value))} type="number" /></Field>
      </div>
    </>}

    {/* Real Estate */}
    {a.assetType==="realEstate" && <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Fair Market Value"><Input value={a.value} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Cost Basis"><Input value={a.costBasis} onChange={e => upd("costBasis", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      {gain > 0 && <div style={{ fontSize:11, color:C.orange }}>{"Embedded gain: "}{fmtD(gain, true)}</div>}
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {"Income (annual)"}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Net Cash Flow"><Input value={a.netCashFlow} onChange={e => upd("netCashFlow", Number(e.target.value))} type="number" prefix="$" /></Field>
        <Field label="Taxable Income (Sch E)"><Input value={a.taxableIncome} onChange={e => upd("taxableIncome", Number(e.target.value))} type="number" prefix="$" /></Field>
      </div>
      {(a.netCashFlow||0)!==0 && (a.taxableIncome||0)!==0 && (a.netCashFlow||0)!==(a.taxableIncome||0) && <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
        <div style={{ display:"flex", justifyContent:"space-between", color:C.textDim }}>
          <span>{"Depreciation Shield"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.green }}>{fmtD((a.netCashFlow||0)-(a.taxableIncome||0), true)}</span>
        </div>
      </div>}
    </>}

    {/* Retirement */}
    {a.assetType==="retirement" && <Field label="Balance">
      <Input value={a.value} onChange={e => upd("value", Number(e.target.value))} type="number" prefix="$" />
    </Field>}

    {/* Proration */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, borderTop:`1px solid ${C.border}`, paddingTop:10, marginTop:8 }}>
      <Field label="Start Month"><Select value={a.startMonth??0} onChange={e => upd("startMonth", Number(e.target.value))}
        options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({value:i,label:m}))} /></Field>
      <Field label="End Month"><Select value={a.endMonth??11} onChange={e => upd("endMonth", Number(e.target.value))}
        options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => ({value:i,label:m}))} /></Field>
    </div>
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
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.textDim, cursor:"pointer", marginTop:4 }}>
          <input type="checkbox" checked={profile.reProStatus||false} onChange={e => updProfile("reProStatus", e.target.checked)} />
          {"RE Professional Status (rental losses offset ordinary)"}
        </label>
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

    {/* Phantom Income Alert */}
    {result.phantomIncome > 0 && <Card style={{ padding:"16px 20px", background:C.red+"06", borderColor:C.red+"30" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase", color:C.red, marginBottom:4 }}>{"Phantom Income"}</div>
          <div style={{ fontSize:11, color:C.textDim }}>
            {"K-1 taxable: "}{fmtD(result.totalGrossK1ForDistEnts, true)}
            {" | Actual distributions: "}{fmtD(result.totalActualDist, true)}
          </div>
          <div style={{ fontSize:10, color:C.textMuted, marginTop:4 }}>
            {"You owe tax on "}{fmtD(result.phantomIncome, true)}{" of income retained by the firm (PTET, retirement, capital, holdback)."}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:28, color:C.red, fontWeight:600 }}>{fmtD(result.phantomIncome, true)}</div>
          <div style={{ fontSize:10, color:C.textMuted }}>retained by firm</div>
        </div>
      </div>
    </Card>}

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
function DeductionsTab({ deductions, setDeductions, profile, updProfile, result, liabilities, setLiabs }) {
  const addDed = (type) => setDeductions(prev => [...prev, { id: uid(), type, amount: 0, label: "" }]);
  const updDed = (id, k, v) => setDeductions(prev => prev.map(d => d.id === id ? { ...d, [k]: v } : d));
  const delDed = (id) => setDeductions(prev => prev.filter(d => d.id !== id));
  const addLiab = () => setLiabs(prev => [...prev, { id:uid(), label:"", balance:0, monthlyPayment:0, annualInterest:0, deductType:"schedA", startMonth:0, endMonth:11 }]);
  const updLiab = (id, k, v) => setLiabs(prev => prev.map(l => l.id===id ? {...l,[k]:v} : l));
  const delLiab = (id) => setLiabs(prev => prev.filter(l => l.id!==id));

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <SectionHeader sub="Deductions, liabilities, and prior year safe harbor">{"Deductions, Liabilities & Prior Year"}</SectionHeader>
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
    {/* Liabilities */}
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.15em", textTransform:"uppercase" }}>Liabilities</div>
        <Btn variant="ghost" onClick={addLiab} style={{ fontSize:9, border:`1px solid ${C.border}`, borderRadius:3 }}>{"+ Add Liability"}</Btn>
      </div>
      {(liabilities||[]).length === 0 && <div style={{ textAlign:"center", padding:20, color:C.textMuted, fontSize:12 }}>No liabilities. Add mortgages, SBLOCs, margin loans, etc.</div>}
      {(liabilities||[]).map(l => (
        <div key={l.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr auto", gap:8, alignItems:"end" }}>
            <Field label="Label"><Input value={l.label||""} onChange={e => updLiab(l.id, "label", e.target.value)} /></Field>
            <Field label="Balance"><Input value={l.balance} onChange={e => updLiab(l.id, "balance", Number(e.target.value))} type="number" prefix="$" /></Field>
            <Field label="Mo. Payment"><Input value={l.monthlyPayment} onChange={e => updLiab(l.id, "monthlyPayment", Number(e.target.value))} type="number" prefix="$" /></Field>
            <Field label="Ann. Interest"><Input value={l.annualInterest} onChange={e => updLiab(l.id, "annualInterest", Number(e.target.value))} type="number" prefix="$" /></Field>
            <Field label="Deductibility">
              <Select value={l.deductType||"schedA"} onChange={e => updLiab(l.id, "deductType", e.target.value)}
                options={[{value:"schedA",label:"Sched A (res. mortgage)"},{value:"schedE",label:"Sched E (inv. property)"},{value:"investment",label:"Inv. Interest"},{value:"none",label:"Non-deductible"}]} />
            </Field>
            <Btn variant="ghost" onClick={() => delLiab(l.id)} style={{ color:C.red, marginBottom:2 }}>{"x"}</Btn>
          </div>
        </div>
      ))}
      {(liabilities||[]).length > 0 && <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8, fontSize:11 }}>
        <span style={{ color:C.textDim }}>{"Total Balances"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.red }}>{fmtD((liabilities||[]).reduce((t,l)=>t+(l.balance||0),0), true)}</span>
      </div>}
    </Card>
    {/* Itemized Deductions */}
    <Card style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase" }}>{"Itemized Deductions"}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {DEDUCTION_TYPES.map(dt => (
            <Btn key={dt.id} variant="ghost" onClick={() => addDed(dt.id)}
              style={{ fontSize: 9, border: `1px solid ${C.border}`, borderRadius: 3 }}>+ {dt.label.split("(")[0].trim()}</Btn>
          ))}
        </div>
      </div>
      {result.schedAInterest > 0 && <div style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ flex:1, fontSize:12, color:C.textDim }}>{"Mortgage Interest (from liabilities)"}</div>
        <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:C.text }}>{fmtD(result.schedAInterest)}</div>
        <Badge color={C.blue}>auto</Badge>
      </div>}
      {deductions.length === 0 && result.schedAInterest <= 0 && <div style={{ textAlign: "center", padding: 20, color: C.textMuted, fontSize: 12 }}>No deductions added. Use buttons above to add.</div>}
      {deductions.map(d => {
        const dt = DEDUCTION_TYPES.find(t => t.id === d.type);
        return <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, fontSize: 12, color: C.textDim }}>{dt?.label || d.type}</div>
          <Input value={d.amount} onChange={e => updDed(d.id, "amount", Number(e.target.value))} type="number" prefix="$" style={{ width: 120 }} />
          {dt?.max && d.amount > dt.max && <Badge color={C.red}>{"Capped at $"}{fmt(dt.max)}</Badge>}
          <Btn variant="ghost" onClick={() => delDed(d.id)} style={{ color: C.red }}>{"x"}</Btn>
        </div>;
      })}
    </Card>
  </div>;
}

// ─── CASH FLOW TAB ──────────────────────────────────────────────────────────

function CashFlowTab({ profile, streams, assets, result, liabilities, entities }) {
  const monthly = useMemo(() => computeMonthlyCashflow(profile, streams, assets, result, liabilities, entities), [profile, streams, assets, result, liabilities, entities]);

  // Compute derived display data
  const deposits = monthly.map(m => m.cashIn);
  const taxes = monthly.map(m => m.estPmt);
  const living = monthly.map(m => m.livingExp);
  const debt = monthly.map(m => m.liabPmt);
  const investments = monthly.map(m => m.capCall + m.entDeduc);
  const nets = monthly.map(m => m.net);
  const cums = monthly.map(m => m.cumulative);
  const totDep = deposits.reduce((a,b)=>a+b,0);
  const totTax = taxes.reduce((a,b)=>a+b,0);
  const totLiv = living.reduce((a,b)=>a+b,0);
  const totDebt = debt.reduce((a,b)=>a+b,0);
  const totInv = investments.reduce((a,b)=>a+b,0);
  const yearEnd = cums[11]||0;
  const distMonths = monthly.map(m => m.entDist > 0);
  const taxMonths = monthly.map(m => m.estPmt > 0);

  // Chart SVG dimensions
  const W=720, H=240, padL=52, padR=16, padT=20, padB=32;
  const chartW = W-padL-padR, chartH = H-padT-padB;
  const allVals = [...nets, ...cums];
  const yMin = Math.min(0, ...allVals);
  const yMax = Math.max(0, ...allVals);
  const yRange = Math.max(1, yMax-yMin) * 1.15;
  const yLow = yMin - (yRange - (yMax-yMin))*0.3;
  const yHigh = yLow + yRange;
  const toY = v => padT + chartH * (1 - (v-yLow)/yRange);
  const zeroY = toY(0);
  const barW = chartW / 12 * 0.55;
  const barGap = chartW / 12;

  // Y-axis ticks
  const yTicks = [];
  const step = Math.pow(10, Math.floor(Math.log10(yRange/4)));
  const niceStep = yRange/4 > step*5 ? step*5 : yRange/4 > step*2 ? step*2 : step;
  for (let v = Math.ceil(yLow/niceStep)*niceStep; v <= yHigh; v += niceStep) yTicks.push(v);

  const dash = (v) => Math.abs(v) < 0.5 ? "\u2014" : fmtD(v, true);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <SectionHeader sub="Cash-basis inflows and outflows by month">{"12-Month Cash Flow"}</SectionHeader>

    {/* Summary cards */}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
      {[
        {l:"Total deposits", v:totDep, c:"#1D9E75"},
        {l:"Total taxes", v:totTax, c:"#C04040"},
        {l:"Total expenses", v:totLiv+totDebt+totInv, c:C.text},
        {l:"Year-end balance", v:yearEnd, c:yearEnd>=0?"#1D9E75":"#C04040"},
      ].map((k,i) => (
        <Card key={i} style={{ padding:"14px 16px" }}>
          <div style={{ fontSize:10, color:C.textMuted, marginBottom:4 }}>{k.l}</div>
          <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:22, color:k.c, fontWeight:500 }}>{fmtD(k.v, true)}</div>
        </Card>
      ))}
    </div>

    {/* Chart: net bars + cumulative line */}
    <Card style={{ padding:"20px 24px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto" }}>
        {/* Grid lines */}
        {yTicks.map((v,i) => <g key={i}>
          <line x1={padL} x2={W-padR} y1={toY(v)} y2={toY(v)} stroke={C.border} strokeWidth={0.5} />
          <text x={padL-6} y={toY(v)+3.5} textAnchor="end" fontSize={9} fill={C.textMuted} fontFamily="'IBM Plex Mono',monospace">
            {v===0 ? "$0" : `${v<0?"-":""}$${Math.abs(Math.round(v/1000))}K`}
          </text>
        </g>)}
        {/* Zero line */}
        <line x1={padL} x2={W-padR} y1={zeroY} y2={zeroY} stroke={C.textDim} strokeWidth={1} />
        {/* Bars */}
        {nets.map((v,i) => {
          const x = padL + i*barGap + (barGap-barW)/2;
          const top = v>=0 ? toY(v) : zeroY;
          const h = Math.max(2, Math.abs(toY(v) - zeroY));
          return <rect key={i} x={x} y={top} width={barW} height={h} rx={2}
            fill={v>=0 ? "#1D9E7588" : "#C0404066"} stroke={v>=0 ? "#1D9E75" : "#C04040"} strokeWidth={0.5} />;
        })}
        {/* Cumulative line */}
        <polyline fill="none" stroke={C.text} strokeWidth={2} strokeLinejoin="round"
          points={cums.map((v,i) => `${padL + i*barGap + barGap/2},${toY(v)}`).join(" ")} />
        {/* Cumulative dots */}
        {cums.map((v,i) => <circle key={i} cx={padL + i*barGap + barGap/2} cy={toY(v)} r={3.5}
          fill={v>=0?"#1D9E75":"#C04040"} stroke="white" strokeWidth={1.5} />)}
        {/* Month labels */}
        {monthly.map((m,i) => <text key={i} x={padL + i*barGap + barGap/2} y={H-6}
          textAnchor="middle" fontSize={10} fill={C.textMuted} fontFamily="'Inter',sans-serif">{m.month}</text>)}
      </svg>
      <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:8 }}>
        {[{l:"Net positive",c:"#1D9E7588",type:"bar"},{l:"Net negative",c:"#C0404066",type:"bar"},{l:"Cumulative balance",c:C.text,type:"line"}]
          .map((x,i) => <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:C.textMuted }}>
            {x.type==="bar" ? <div style={{ width:12, height:8, borderRadius:2, background:x.c }} />
              : <div style={{ width:16, height:2.5, borderRadius:1, background:x.c }} />}
            {x.l}
          </div>)}
      </div>
    </Card>

    {/* Detail table */}
    <Card style={{ padding:"20px 24px", overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:`2px solid ${C.text}` }}>
            <th style={{ textAlign:"left", padding:"8px 6px", fontSize:10, fontWeight:500, color:C.textMuted, letterSpacing:"0.04em" }}></th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:"#0F6E56", letterSpacing:"0.04em" }}>Deposits</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:"#993C1D", letterSpacing:"0.04em" }}>Taxes</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:C.textMuted, letterSpacing:"0.04em" }}>Living</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:C.textMuted, letterSpacing:"0.04em" }}>Debt</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:"#534AB7", letterSpacing:"0.04em" }}>Investments</th>
            <th style={{ textAlign:"right", padding:"8px 10px", fontSize:10, fontWeight:500, color:C.text, letterSpacing:"0.04em" }}>Net</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:10, fontWeight:500, color:C.textMuted, letterSpacing:"0.04em" }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m,i) => {
            const dep = deposits[i];
            const inv = investments[i];
            const isDist = distMonths[i];
            const isTax = taxMonths[i];
            return <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.surface2:"transparent",
              borderLeft:isDist?`3px solid #1D9E75`:isTax?`3px solid #C04040`:"3px solid transparent" }}>
              <td style={{ padding:"8px 6px", fontSize:12, fontWeight:500, color:C.text }}>
                {m.month}
                {isDist && <span style={{ fontSize:9, color:"#1D9E75", marginLeft:4, fontWeight:400 }}>dist.</span>}
                {isTax && <span style={{ fontSize:9, color:"#C04040", marginLeft:4, fontWeight:400 }}>{m.qDue || "est."}</span>}
              </td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                color:"#1D9E75", fontWeight:isDist?500:400 }}>{fmtD(dep, true)}</td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                color:m.estPmt>0?"#C04040":C.textMuted }}>{m.estPmt > 0.5 ? fmtD(m.estPmt, true) : "\u2014"}</td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:C.textDim }}>
                {fmtD(m.livingExp, true)}</td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:C.textDim }}>
                {m.liabPmt > 0.5 ? fmtD(m.liabPmt, true) : "\u2014"}</td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                color:inv>0.5?"#534AB7":C.textMuted }}>{inv > 0.5 ? fmtD(inv, true) : "\u2014"}</td>
              <td style={{ textAlign:"right", padding:"8px 10px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12,
                fontWeight:500, color:m.net>=0?"#1D9E75":"#C04040" }}>{fmtD(m.net, true)}</td>
              <td style={{ textAlign:"right", padding:"8px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11,
                color:m.cumulative>=0?"#1D9E75":"#C04040" }}>{fmtD(m.cumulative, true)}</td>
            </tr>;
          })}
          {/* Totals row */}
          <tr style={{ borderTop:`2px solid ${C.text}` }}>
            <td style={{ padding:"10px 6px", fontSize:12, fontWeight:500 }}>Total</td>
            <td style={{ textAlign:"right", padding:"10px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"#0F6E56", fontWeight:500 }}>{fmtD(totDep, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"#C04040", fontWeight:500 }}>{fmtD(totTax, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:500 }}>{fmtD(totLiv, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:500 }}>{fmtD(totDebt, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 6px", fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"#534AB7", fontWeight:500 }}>{fmtD(totInv, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 10px", fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:500,
              color:yearEnd>=0?"#1D9E75":"#C04040" }}>{fmtD(yearEnd, true)}</td>
            <td style={{ textAlign:"right", padding:"10px 6px" }}></td>
          </tr>
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
          {e.pteElection && <div style={{ marginTop:4, display:"flex", gap:4 }}>
            <Badge color={C.accent}>PTE {e.pteRate}% {e.pteState||""}</Badge>
          </div>}
          {((e.retirementContrib||0)>0 || (e.healthInsurance||0)>0) && <div style={{ marginTop:3, display:"flex", gap:4, flexWrap:"wrap" }}>
            {(e.retirementContrib||0)>0 && <Badge color={C.blue}>{fmtD(e.retirementContrib,true)} retire</Badge>}
            {(e.healthInsurance||0)>0 && <Badge color={C.teal}>{fmtD(e.healthInsurance,true)} health</Badge>}
            {(e.actualDistributions||0)>0 && <Badge color={C.green}>{fmtD(e.actualDistributions,true)} dist</Badge>}
          </div>}
          {e.ownedBy && <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
            Owned by: {entities.find(x => x.id === e.ownedBy)?.label || "—"} ({e.ownershipPct}%)
          </div>}
          {editing === e.id && <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }} onClick={ev => ev.stopPropagation()}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Name"><Input value={e.label} onChange={ev => updEntity(e.id, "label", ev.target.value)} /></Field>
              <Field label="Owned By">
                <Select value={e.ownedBy} onChange={ev => updEntity(e.id, "ownedBy", ev.target.value)}
                  options={[{ value: "", label: "-- Top-level --" }, ...entities.filter(x => x.id !== e.id).map(x => ({ value: x.id, label: x.label }))]} />
              </Field>
              <Field label="Ownership %"><Input value={e.ownershipPct} onChange={ev => updEntity(e.id, "ownershipPct", Number(ev.target.value))} type="number" /></Field>
              {/* Partnership tax properties */}
              <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.1em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:8, marginTop:4 }}>
                {"Partnership / Entity Tax"}
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.textDim, cursor:"pointer" }}>
                <input type="checkbox" checked={e.pteElection||false} onChange={ev => updEntity(e.id, "pteElection", ev.target.checked)} />
                {"PTE / SALT workaround election"}
              </label>
              {e.pteElection && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <Field label="PTE Rate %"><Input value={e.pteRate} onChange={ev => updEntity(e.id, "pteRate", Number(ev.target.value))} type="number" /></Field>
                <Field label="PTE State"><Input value={e.pteState||""} onChange={ev => updEntity(e.id, "pteState", ev.target.value)} /></Field>
              </div>}
              <Field label="Retirement Contributions (annual)"><Input value={e.retirementContrib} onChange={ev => updEntity(e.id, "retirementContrib", Number(ev.target.value))} type="number" prefix="$" /></Field>
              <Field label="Health Insurance (annual, deductible)"><Input value={e.healthInsurance} onChange={ev => updEntity(e.id, "healthInsurance", Number(ev.target.value))} type="number" prefix="$" /></Field>
              {/* Approach C: Actual distributions */}
              <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.1em", textTransform:"uppercase", borderTop:`1px solid ${C.border}`, paddingTop:8, marginTop:4 }}>
                {"Cash Distributions (actual)"}
              </div>
              <Field label="Total Distributions Received (annual)"><Input value={e.actualDistributions} onChange={ev => updEntity(e.id, "actualDistributions", Number(ev.target.value))} type="number" prefix="$" /></Field>
              {(e.actualDistributions||0) > 0 && <div style={{ background:C.surface2, borderRadius:6, padding:10, fontSize:11 }}>
                <div style={{ fontSize:9, color:C.textMuted, marginBottom:4 }}>{"Draws + advances + year-end true-up"}</div>
              </div>}
              <Field label="Notes"><Input value={e.notes} onChange={ev => updEntity(e.id, "notes", ev.target.value)} placeholder="Filing notes, EIN, etc." /></Field>
              <Btn variant="danger" onClick={() => delEntity(e.id)} style={{ marginTop: 4 }}>Delete Entity</Btn>
            </div>
          </div>}
        </Card>
      ))}
    </div>
  </div>;
}

// ─── PRINT REPORT ───────────────────────────────────────────────────────────
function generateReport(profile, result, bs, streams, assets, entities, liabilities) {
  const f = (n, short) => {
    if (n === undefined || n === null || isNaN(n)) return "$0";
    if (short) {
      if (Math.abs(n) >= 1e6) return `${n<0?"(":""}$${(Math.abs(n)/1e6).toFixed(1)}M${n<0?")":""}`;
      if (Math.abs(n) >= 1e3) return `${n<0?"(":""}$${(Math.abs(n)/1e3).toFixed(0)}K${n<0?")":""}`;
    }
    const s = n < 0 ? "(" : "", e = n < 0 ? ")" : "";
    return `${s}$${Math.round(Math.abs(n)).toLocaleString()}${e}`;
  };
  const p = (n) => `${(n||0).toFixed(1)}%`;
  const date = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
  const TIER_MAP = {cash:"1",security:"2",hedgeFund:"3",peFund:"4",realEstate:"4",retirement:"R"};

  // Monthly CF
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const entMap = {}; (entities||[]).forEach(en => { entMap[en.label] = en; });
  const dSched = {}; if((result.distCashIn||0)>0){(entities||[]).forEach(en=>{if((en.actualDistributions||0)>0){const dm=en.distributionMonths||[2,5,8,11];const pm=en.actualDistributions/dm.length;dm.forEach(m=>{dSched[m]=(dSched[m]||0)+pm;});}});}
  const qMap={3:"q1Paid",5:"q2Paid",8:"q3Paid",0:"q4Paid"};
  const edM=(result.entityDeducNonDist||0)/12, acM=(result.assetCashIn||0)/12;
  let cum=0;
  const monthly = months.map((m,i) => {
    let si=0,wh=0;
    streams.forEach(s=>{const sm=s.startMonth??0,em=s.endMonth??11;if(i<sm||i>em)return;const ent=entMap[s.entity];if((ent?.actualDistributions||0)>0)return;const t=s.timing||"monthly";let a=0;if(t==="monthly")a=(s.amount||0)/12;else if(t==="quarterly"&&[2,5,8,11].includes(i))a=(s.amount||0)/4;else if(t==="annual"&&i===(s.timingMonth??11))a=s.amount||0;else if(t==="semi"&&[5,11].includes(i))a=(s.amount||0)/2;si+=a;wh+=a*((s.fedWithholdingPct||0)+(s.stateWithholdingPct||0))/100;});
    const ed=dSched[i]||0;let fd=0;if([5,11].includes(i))fd=result.invDistributions/2;
    const ci=si-wh+ed+fd+acM;let ep=0;if(qMap[i]!==undefined)ep=profile[qMap[i]]||0;
    let cc=0;if([2,5,8,11].includes(i))cc=result.invCapCalls/4;
    let lp=0;(liabilities||[]).forEach(l=>{const sm=l.startMonth??0,em=l.endMonth??11;if(i>=sm&&i<=em)lp+=(l.monthlyPayment||0);});
    const n=ci-(profile.livingExpenses||0)-lp-ep-cc-edM;cum+=n;
    return {month:m,cashIn:ci,entDist:ed,estPmt:ep,livingExp:profile.livingExpenses||0,liabPmt:lp,capCall:cc,entDeduc:edM,net:n,cumulative:cum};
  });

  // Asset-derived income
  const assetIncome = (assets||[]).map(a => {
    const items=[];const at=a.assetType;const pf=((a.endMonth??11)-(a.startMonth??0)+1)/12;
    if(at==="cash"&&(a.yieldPct||0)>0)items.push({src:a.label,char:"Interest",amt:(a.value||0)*(a.yieldPct||0)/100*pf});
    else if(at==="security"){if((a.divYieldPct||0)>0)items.push({src:a.label,char:"Qual. Div",amt:(a.value||0)*(a.divYieldPct||0)/100*pf});if((a.realizedGainPct||0)!==0)items.push({src:a.label,char:"LTCG",amt:(a.value||0)*(a.realizedGainPct||0)/100*pf});}
    else if(at==="hedgeFund"||at==="peFund"){const n=a.nav||0;if((a.ordPct||0)+(a.intPct||0)!==0)items.push({src:a.label,char:"Ordinary",amt:n*((a.ordPct||0)+(a.intPct||0))/100*pf});if((a.stcgPct||0)!==0)items.push({src:a.label,char:"STCG",amt:n*(a.stcgPct||0)/100*pf});if((a.ltcgPct||0)!==0)items.push({src:a.label,char:"LTCG",amt:n*(a.ltcgPct||0)/100*pf});if((a.qualDivPct||0)!==0)items.push({src:a.label,char:"Qual. Div",amt:n*(a.qualDivPct||0)/100*pf});if((a.taxExPct||0)!==0)items.push({src:a.label,char:"Tax-Exempt",amt:n*(a.taxExPct||0)/100*pf});}
    else if(at==="realEstate"&&(a.taxableIncome||0)!==0)items.push({src:a.label,char:"Passive",amt:(a.taxableIncome||0)*pf});
    return items;
  }).flat();

  // Per-fund breakdowns for report
  const isDelphi = (a) => a.label && a.label.toLowerCase().includes("delphi");
  const isFlex = (a) => a.label && a.label.toLowerCase().includes("flex");
  const fundBreakdown = (assets||[]).map(a => {
    const at = a.assetType; const pf = ((a.endMonth??11)-(a.startMonth??0)+1)/12;
    if (at!=="hedgeFund" && at!=="peFund") return null;
    const n = a.nav||0;
    return { label:a.label, delphi:isDelphi(a), flex:isFlex(a),
      ord: n*((a.ordPct||0)+(a.intPct||0))/100*pf,
      stcg: n*(a.stcgPct||0)/100*pf,
      ltcg: n*(a.ltcgPct||0)/100*pf,
      qdiv: n*(a.qualDivPct||0)/100*pf,
    };
  }).filter(Boolean);
  // Ordinary income sources
  const delphiOrd = fundBreakdown.filter(x=>x.delphi).reduce((t,x)=>t+x.ord,0);
  const streamOrd = streams.reduce((t,s) => { const c=INCOME_TYPES[s.type]?.char; return (c==="ordEarned"||c==="ordInv") ? t+(s.amount||0)*((s.endMonth??11)-(s.startMonth??0)+1)/12 : t; },0);
  const otherAssetOrd = fundBreakdown.filter(x=>!x.delphi).reduce((t,x)=>t+x.ord,0);
  const cashYield = (assets||[]).filter(a=>a.assetType==="cash").reduce((t,a)=>t+(a.value||0)*(a.yieldPct||0)/100*((a.endMonth??11)-(a.startMonth??0)+1)/12,0);
  const allOtherOrd = streamOrd + otherAssetOrd + cashYield;
  const netOrd = delphiOrd + allOtherOrd;
  // Capital gains sources
  const flexSTCG = fundBreakdown.filter(x=>x.flex).reduce((t,x)=>t+x.stcg,0);
  const otherSTCG = fundBreakdown.filter(x=>!x.flex).reduce((t,x)=>t+x.stcg,0);
  const streamSTCG = streams.reduce((t,s) => INCOME_TYPES[s.type]?.char==="stcg" ? t+(s.amount||0)*((s.endMonth??11)-(s.startMonth??0)+1)/12 : t, 0);
  const netSTCG = flexSTCG + otherSTCG + streamSTCG;
  const delphiLTCG = fundBreakdown.filter(x=>x.delphi).reduce((t,x)=>t+x.ltcg,0);
  const otherFundLTCG = fundBreakdown.filter(x=>!x.delphi).reduce((t,x)=>t+x.ltcg,0);
  const secLTCG = (assets||[]).filter(a=>a.assetType==="security").reduce((t,a)=>t+(a.value||0)*(a.realizedGainPct||0)/100*((a.endMonth??11)-(a.startMonth??0)+1)/12,0);
  const streamLTCG = streams.reduce((t,s) => INCOME_TYPES[s.type]?.char==="ltcg" ? t+(s.amount||0)*((s.endMonth??11)-(s.startMonth??0)+1)/12 : t, 0);
  const allOtherLTCG = otherFundLTCG + secLTCG + streamLTCG;
  const netLTCG = delphiLTCG + allOtherLTCG;

  const fedOwes = result.balanceDueFed > 0;
  const row = (l,v,color) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E8E5DE"><span style="font-size:11px;color:#6B6860">${l}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:${color||'#1A1C20'}">${v}</span></div>`;
  const rowB = (l,v,color) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #0F1A2E;margin-top:6px"><span style="font-size:12px;font-weight:600;color:#1A1C20">${l}</span><span style="font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600;color:${color}">${v}</span></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Yosemite Tax Report - ${profile.name||"Client"}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',system-ui,sans-serif;color:#1A1C20;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:letter portrait;margin:0.5in}
  .page{padding:24px 0;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .hdr{font-size:11px;color:#0F1A2E;letter-spacing:0.2em;text-transform:uppercase;border-bottom:2px solid #0F1A2E;padding-bottom:6px;margin-bottom:16px;font-weight:500}
  .mono{font-family:'IBM Plex Mono',monospace}
  table{width:100%;border-collapse:collapse}
  th{text-align:right;padding:5px 6px;font-size:8px;color:#0F1A2E;letter-spacing:0.08em;font-weight:500}
  th:first-child{text-align:left}
  td{padding:4px 6px;font-size:9px;font-family:'IBM Plex Mono',monospace}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
  .kpi{padding:12px 14px;border:1px solid #DCD9D0;border-radius:6px}
  .kpi-label{font-size:8px;color:#8A8680;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px}
  .kpi-val{font-family:'IBM Plex Mono',monospace;font-size:18px;color:#0F1A2E}
  .callout{padding:12px 16px;border-radius:6px;margin-bottom:12px;font-size:11px;color:#6B6860}
  .alt{background:#FAFAF8}
</style></head><body>

<!-- PAGE 1: Executive Summary -->
<div class="page">
  <div style="margin-bottom:28px">
    <div style="font-size:24px;color:#0F1A2E;font-weight:500">Yosemite</div>
    <div style="font-size:10px;color:#8A8680;letter-spacing:0.15em;text-transform:uppercase">Tax Planning Summary | ${date}</div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:24px;padding:14px 18px;background:#F8F7F4;border-radius:6px">
    <div><div style="font-size:8px;color:#8A8680;letter-spacing:0.1em;text-transform:uppercase">Household</div><div style="font-size:15px;color:#0F1A2E;font-weight:500;margin-top:2px">${profile.name||"Client"}</div></div>
    <div><div style="font-size:8px;color:#8A8680;letter-spacing:0.1em;text-transform:uppercase">Filing</div><div style="font-size:13px;margin-top:2px">${(profile.filingStatus||"").toUpperCase()}</div></div>
    <div><div style="font-size:8px;color:#8A8680;letter-spacing:0.1em;text-transform:uppercase">State</div><div style="font-size:13px;margin-top:2px">${profile.state}</div></div>
    <div><div style="font-size:8px;color:#8A8680;letter-spacing:0.1em;text-transform:uppercase">Tax Year</div><div style="font-size:13px;margin-top:2px">2025</div></div>
  </div>
  <div class="hdr">Key Metrics</div>
  <div class="grid3">
    ${[{l:"Adjusted Gross Income",v:f(result.agi,true)},{l:"Federal Tax",v:f(result.federalTax,true)},{l:"State Tax (after PTE)",v:f(result.stateTaxAfterPTE,true)},
      {l:"Total Tax Liability",v:f(result.totalTax,true),c:"#C04040"},{l:"Effective Rate",v:p(result.effectiveRate)},{l:"NIIT",v:f(result.niit,true)},
      {l:"Net Worth",v:f(bs.netWorth,true),c:"#0F1A2E"},{l:"Net Cash After Tax",v:f(result.netCashAfterTax,true),c:result.netCashAfterTax>=0?"#2D8060":"#C04040"},{l:"Marginal Rate (Ord.)",v:p(result.marginalOrd)}
    ].map(k => `<div class="kpi"><div class="kpi-label">${k.l}</div><div class="kpi-val" style="color:${k.c||'#0F1A2E'}">${k.v}</div></div>`).join("")}
  </div>
  ${result.phantomIncome > 0 ? `<div class="callout" style="background:#FDF4F4;border:1px solid #E8CCCC">
    <div style="font-size:9px;color:#C04040;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">Phantom Income</div>
    K-1 taxable income (${f(result.totalGrossK1ForDistEnts,true)}) exceeds actual distributions (${f(result.totalActualDist,true)}) by <strong>${f(result.phantomIncome,true)}</strong>. Tax is owed on income retained by the firm.
  </div>` : ""}
  ${result.totalPTET > 0 ? `<div class="callout" style="background:#F0FAF6;border:1px solid #C8E8DC">
    <div style="font-size:9px;color:#2D8060;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">SALT Workaround</div>
    PTE election generates ${f(result.totalPTET,true)} in entity-level state tax, providing ~${f(result.pteFedSavings,true)} in federal savings.
  </div>` : ""}
</div>

<!-- PAGE 2: Income Summary -->
<div class="page">
  <div class="hdr">Income Summary</div>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:8px">Income Streams</div>
  <table style="margin-bottom:20px"><thead><tr style="border-bottom:2px solid #0F1A2E">
    <th style="text-align:left">Source</th><th style="text-align:left">Type</th><th style="text-align:left">Entity</th><th>Annual</th>
  </tr></thead><tbody>
    ${streams.map(s => `<tr style="border-bottom:1px solid #E8E5DE"><td style="text-align:left">${s.label||s.type}</td><td style="text-align:left;color:#8A8680">${INCOME_TYPES[s.type]?.label||s.type}</td><td style="text-align:left;color:#8A8680">${s.entity}</td><td style="text-align:right">${f(s.amount,true)}</td></tr>`).join("")}
  </tbody></table>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:8px">Asset-Derived Income</div>
  <table style="margin-bottom:20px"><thead><tr style="border-bottom:2px solid #0F1A2E">
    <th style="text-align:left">Source</th><th style="text-align:left">Character</th><th>Annual</th>
  </tr></thead><tbody>
    ${assetIncome.map(a => `<tr style="border-bottom:1px solid #E8E5DE"><td style="text-align:left">${a.src}</td><td style="text-align:left">${a.char}</td><td style="text-align:right;color:${a.amt<0?'#2D8060':'#1A1C20'}">${f(a.amt,true)}</td></tr>`).join("")}
  </tbody></table>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:8px">Income by Character</div>
  <div class="grid4">
    ${[{l:"Ordinary (Earned)",v:result.ordEarned},{l:"Ordinary (Investment)",v:result.ordInv},{l:"LTCG (after netting)",v:result.netLTAfter},{l:"Qualified Dividends",v:result.qualDiv},
      {l:"STCG (after netting)",v:result.netSTAfter},{l:"Passive",v:result.passiveAllowed},{l:"Tax-Exempt",v:result.taxExempt},{l:"Suspended PAL",v:result.suspendedPAL}
    ].map(k => `<div style="padding:8px;border:1px solid #E8E5DE;border-radius:4px"><div style="font-size:7px;color:#8A8680;letter-spacing:0.08em;text-transform:uppercase">${k.l}</div><div class="mono" style="font-size:12px;color:${k.v<0?'#2D8060':'#1A1C20'};margin-top:2px">${f(k.v,true)}</div></div>`).join("")}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
    <div>
      <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:8px">Ordinary Income Sources</div>
      <div style="border:1px solid #DCD9D0;border-radius:6px;padding:12px 14px">
        ${row("Delphi Plus", f(delphiOrd,true), delphiOrd<0?"#2D8060":"#1A1C20")}
        ${row("All other sources", f(allOtherOrd,true))}
        ${rowB("Net ordinary income", f(netOrd,true), netOrd<0?"#2D8060":"#0F1A2E")}
        ${delphiOrd<0 ? `<div style="font-size:9px;color:#2D8060;margin-top:6px">Delphi ordinary losses save ~${f(Math.abs(delphiOrd)*(result.marginalOrd/100),true)} at ${p(result.marginalOrd)} marginal rate.</div>` : ""}
      </div>
    </div>
    <div>
      <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:8px">Realized Capital Gains</div>
      <div style="border:1px solid #DCD9D0;border-radius:6px;padding:12px 14px">
        <div style="font-size:9px;color:#8A8680;letter-spacing:0.08em;margin-bottom:4px">SHORT-TERM</div>
        ${row("Flex SMA", f(flexSTCG,true), flexSTCG<0?"#2D8060":"#C04040")}
        ${otherSTCG!==0||streamSTCG!==0 ? row("All other sources", f(otherSTCG+streamSTCG,true)) : ""}
        ${rowB("Net STCG", f(netSTCG,true), netSTCG<0?"#2D8060":"#C04040")}
        <div style="height:8px"></div>
        <div style="font-size:9px;color:#8A8680;letter-spacing:0.08em;margin-bottom:4px">LONG-TERM</div>
        ${delphiLTCG!==0 ? row("Delphi Plus", f(delphiLTCG,true), "#1A1C20") : ""}
        ${row("All other sources", f(allOtherLTCG,true))}
        ${rowB("Net LTCG", f(netLTCG,true), netLTCG<0?"#2D8060":"#0F1A2E")}
        ${flexSTCG<0 ? `<div style="font-size:9px;color:#2D8060;margin-top:6px">Flex harvested ${f(Math.abs(flexSTCG),true)} in ST losses, netting against gains at up to ${p(result.marginalOrd)} ordinary rates.</div>` : ""}
      </div>
    </div>
  </div>
</div>

<!-- PAGE 3: Tax Computation -->
<div class="page">
  <div class="hdr">Tax Computation Waterfall</div>
  ${result.preTaxDeductions > 0 ? `<div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:6px">Entity Pre-Tax Deductions</div>
    ${row("PTET (entity-level state tax)",f(result.totalPTET,true),"#3DDBB4")}
    ${result.totalRetirement>0?row("Retirement Contributions",f(result.totalRetirement,true),"#2E5C94"):""}
    ${result.totalHealthIns>0?row("Self-Employed Health Insurance",f(result.totalHealthIns,true),"#2A7878"):""}
    ${rowB("Total Pre-Tax Deductions",f(result.preTaxDeductions+result.totalHealthIns,true),"#0F1A2E")}
    <div style="height:14px"></div>` : ""}
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:6px">Adjusted Gross Income</div>
  ${row("Total Ordinary Income",f(result.totalOrdinary,true))}
  ${row("Total Preferential Income (LTCG + QDiv)",f(result.totalPref,true))}
  ${rowB("Adjusted Gross Income",f(result.agi,true),"#0F1A2E")}
  <div style="height:14px"></div>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:6px">Deductions</div>
  ${row(result.useItemized?"Itemized Deductions":"Standard Deduction",f(result.deductionAmt,true))}
  ${result.schedAInterest>0?row("&nbsp;&nbsp;incl. Mortgage Interest",f(result.schedAInterest,true),"#8A8680"):""}
  <div style="height:14px"></div>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:6px">Tax Liability</div>
  ${row("Ordinary Tax (brackets)",f(result.ordTax,true))}
  ${row("Preferential Tax (LTCG/QDiv rates)",f(result.prefTax,true))}
  ${row("Net Investment Income Tax (3.8%)",f(result.niit,true))}
  ${rowB("Federal Tax",f(result.federalTax,true),"#C04040")}
  <div style="height:8px"></div>
  ${row("State Tax (gross)",f(result.stateTax,true),"#C04040")}
  ${result.totalPTET>0?row("Less: PTE Credit","("+f(result.totalPTET,true)+")","#2D8060"):""}
  ${row("State Tax (net of PTE)",f(result.stateTaxAfterPTE,true))}
  <div style="height:8px"></div>
  ${rowB("TOTAL TAX LIABILITY",f(result.totalTax,true),"#C04040")}
  ${row("Effective Rate",p(result.effectiveRate),"#8A8680")}
  <div style="height:14px"></div>
  <div style="font-size:11px;color:#0F1A2E;font-weight:500;margin-bottom:6px">Payment Status</div>
  ${result.totalFedWithholding>0?row("Federal Withholding",f(result.totalFedWithholding,true)):""}
  ${result.totalEstPaid>0?row("Estimated Tax Payments",f(result.totalEstPaid,true)):""}
  ${rowB(fedOwes?"Federal Balance Due":"Federal Refund",f(fedOwes?result.balanceDueFed:result.overpaymentFed,true),fedOwes?"#C04040":"#2D8060")}
</div>

<!-- PAGE 4: Balance Sheet -->
<div class="page">
  <div class="hdr">Balance Sheet</div>
  <div class="grid3">
    ${[{l:"Total Assets",v:f(bs.totalAssets,true)},{l:"Total Liabilities",v:f(bs.totalLiabilities,true),c:"#C04040"},{l:"Net Worth",v:f(bs.netWorth,true),c:"#0F1A2E"}].map(k =>
      `<div style="padding:14px 16px;border:1px solid #DCD9D0;border-radius:6px"><div class="kpi-label">${k.l}</div><div class="mono" style="font-size:20px;color:${k.c||'#1A1C20'}">${k.v}</div></div>`).join("")}
  </div>
  ${[{t:"Tier 1: Cash",k:"1"},{t:"Tier 2: Securities",k:"2"},{t:"Tier 3: Hedge Funds",k:"3"},{t:"Tier 4: PE/VC + Real Estate",k:"4"},{t:"Retirement",k:"R"}].map(tier => {
    const ta = assets.filter(a => TIER_MAP[a.assetType]===tier.k);
    if(!ta.length) return "";
    return `<div style="margin-bottom:12px"><div style="font-size:10px;color:#0F1A2E;font-weight:500;margin-bottom:4px">${tier.t} (${f(bs.tiers[tier.k],true)})</div>
      <table><thead><tr style="border-bottom:2px solid #0F1A2E"><th style="text-align:left">Asset</th><th style="text-align:left">Entity</th><th>Value</th><th>Basis</th><th>Gain</th></tr></thead><tbody>
      ${ta.map(a => {const v=(a.assetType==="hedgeFund"||a.assetType==="peFund")?a.nav||0:a.value||0;const b=a.adjBasis||a.costBasis||0;const g=v-b;
        return `<tr style="border-bottom:1px solid #E8E5DE"><td style="text-align:left;font-family:inherit;font-size:9px">${a.label}</td><td style="text-align:left;color:#8A8680;font-family:inherit;font-size:9px">${a.entity||""}</td><td style="text-align:right">${f(v,true)}</td><td style="text-align:right;color:#8A8680">${f(b,true)}</td><td style="text-align:right;color:${g>0?'#A86838':'#2D8060'}">${f(g,true)}</td></tr>`;}).join("")}
      </tbody></table></div>`;
  }).join("")}
  ${(liabilities||[]).length > 0 ? `<div style="margin-top:12px"><div style="font-size:10px;color:#0F1A2E;font-weight:500;margin-bottom:4px">Liabilities</div>
    <table><thead><tr style="border-bottom:2px solid #0F1A2E"><th style="text-align:left">Liability</th><th>Balance</th><th>Mo. Payment</th><th>Ann. Interest</th><th style="text-align:left">Deductibility</th></tr></thead><tbody>
    ${(liabilities||[]).map(l => `<tr style="border-bottom:1px solid #E8E5DE"><td style="text-align:left;font-family:inherit;font-size:9px">${l.label}</td><td style="text-align:right;color:#C04040">${f(l.balance,true)}</td><td style="text-align:right">${f(l.monthlyPayment)}</td><td style="text-align:right">${f(l.annualInterest)}</td><td style="text-align:left;font-family:inherit;font-size:8px;color:#8A8680">${l.deductType==="schedA"?"Sched A":l.deductType==="schedE"?"Sched E":l.deductType==="investment"?"Inv. Interest":"Non-deductible"}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
</div>

<!-- PAGE 5: Cash Flow -->
<div class="page" style="page-break-after:auto">
  <div class="hdr">12-Month Cash Flow Schedule</div>
  <div class="grid4">
    ${[{l:"Total deposits",v:monthly.reduce((t,m)=>t+m.cashIn,0),c:"#1D9E75"},{l:"Total taxes",v:monthly.reduce((t,m)=>t+m.estPmt,0),c:"#C04040"},
      {l:"Total expenses",v:monthly.reduce((t,m)=>t+m.livingExp+m.liabPmt+m.capCall+m.entDeduc,0),c:"#1A1C20"},{l:"Year-end balance",v:monthly[11]?.cumulative||0,c:(monthly[11]?.cumulative||0)>=0?"#1D9E75":"#C04040"}
    ].map(k => `<div style="padding:8px;border:1px solid #DCD9D0;border-radius:4px"><div style="font-size:7px;color:#8A8680;letter-spacing:0.06em">${k.l}</div><div class="mono" style="font-size:14px;color:${k.c};margin-top:2px">${f(k.v,true)}</div></div>`).join("")}
  </div>
  <table><thead><tr style="border-bottom:2px solid #0F1A2E">
    <th style="text-align:left"></th><th style="color:#0F6E56">Deposits</th><th style="color:#993C1D">Taxes</th><th>Living</th><th>Debt</th><th style="color:#534AB7">Invest.</th><th>Net</th><th>Balance</th>
  </tr></thead><tbody>
    ${monthly.map((m,i) => {const inv=m.capCall+m.entDeduc;const isDist=m.entDist>0;const isTax=m.estPmt>0;
      return `<tr style="border-bottom:1px solid #E8E5DE;${i%2===0?'background:#FAFAF8;':''}border-left:3px solid ${isDist?'#1D9E75':isTax?'#C04040':'transparent'}">
        <td style="text-align:left;font-family:inherit;font-size:9px;font-weight:500">${m.month}${isDist?' &#9679;':''}</td>
        <td style="text-align:right;color:#1D9E75;${isDist?'font-weight:500':''}">${f(m.cashIn,true)}</td>
        <td style="text-align:right;color:${isTax?'#C04040':'#B0ACA4'}">${isTax?f(m.estPmt,true):'&mdash;'}</td>
        <td style="text-align:right">${f(m.livingExp,true)}</td>
        <td style="text-align:right;color:${m.liabPmt>0?'#1A1C20':'#B0ACA4'}">${m.liabPmt>0?f(m.liabPmt,true):'&mdash;'}</td>
        <td style="text-align:right;color:${inv>0?'#534AB7':'#B0ACA4'}">${inv>0?f(inv,true):'&mdash;'}</td>
        <td style="text-align:right;font-weight:500;color:${m.net>=0?'#1D9E75':'#C04040'}">${f(m.net,true)}</td>
        <td style="text-align:right;color:${m.cumulative>=0?'#1D9E75':'#C04040'}">${f(m.cumulative,true)}</td></tr>`;}).join("")}
    <tr style="border-top:2px solid #0F1A2E">
      <td style="font-family:inherit;font-size:9px;font-weight:500;padding:6px 6px">Total</td>
      <td style="text-align:right;color:#0F6E56;font-weight:500">${f(monthly.reduce((t,m)=>t+m.cashIn,0),true)}</td>
      <td style="text-align:right;color:#C04040;font-weight:500">${f(monthly.reduce((t,m)=>t+m.estPmt,0),true)}</td>
      <td style="text-align:right;font-weight:500">${f(monthly.reduce((t,m)=>t+m.livingExp,0),true)}</td>
      <td style="text-align:right;font-weight:500">${f(monthly.reduce((t,m)=>t+m.liabPmt,0),true)}</td>
      <td style="text-align:right;color:#534AB7;font-weight:500">${f(monthly.reduce((t,m)=>t+m.capCall+m.entDeduc,0),true)}</td>
      <td style="text-align:right;font-weight:500;color:${(monthly[11]?.cumulative||0)>=0?'#1D9E75':'#C04040'}">${f(monthly[11]?.cumulative||0,true)}</td>
      <td></td>
    </tr>
  </tbody></table>
  <div style="margin-top:20px;font-size:8px;color:#B0ACA4;text-align:center">Prepared by Yosemite | For planning purposes only | Not tax advice</div>
</div>

</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
}

// ─── SCENARIO ANALYSIS ──────────────────────────────────────────────────────
const SCENARIO_PRESETS = [
  { id:"s_strong", label:"Strong Year (+$400K)", desc:"K-1 profit allocation up $400K",
    apply:(p,st,a,d,e,l) => { const s2=st.map(s=>s.type==="business"&&s.timing==="quarterly"?{...s,amount:(s.amount||0)+400000}:s); return [p,s2,a,d,e,l]; }},
  { id:"s_weak", label:"Weak Year (-$400K)", desc:"K-1 profit allocation down $400K",
    apply:(p,st,a,d,e,l) => { const s2=st.map(s=>s.type==="business"&&s.timing==="quarterly"?{...s,amount:Math.max(0,(s.amount||0)-400000)}:s); return [p,s2,a,d,e,l]; }},
  { id:"s_flex_2m", label:"Flex +$2M Collateral", desc:"Add $2M collateral to Flex SMA (same leverage)",
    apply:(p,st,a,d,e,l) => { const a2=a.map(x=>x.label?.includes("Flex")?{...x,nav:(x.nav||0)+2000000}:x); return [p,st,a2,d,e,l]; }},
  { id:"s_flex_upgrade", label:"Flex 145 to 250", desc:"Increase Flex leverage from F145 to F250 (-32% to -50% STCL)",
    apply:(p,st,a,d,e,l) => { const a2=a.map(x=>x.label?.includes("Flex")?{...x,stcgPct:-50,qualDivPct:1}:x); return [p,st,a2,d,e,l]; }},
  { id:"s_flex_both", label:"Flex +$2M + Upgrade to 250", desc:"More collateral AND higher leverage",
    apply:(p,st,a,d,e,l) => { const a2=a.map(x=>x.label?.includes("Flex")?{...x,nav:(x.nav||0)+2000000,stcgPct:-50,qualDivPct:1}:x); return [p,st,a2,d,e,l]; }},
  { id:"s_delphi_up", label:"Delphi +$3M", desc:"Increase Delphi Plus to ~$8.4M",
    apply:(p,st,a,d,e,l) => { const a2=a.map(x=>x.label?.includes("Delphi")?{...x,nav:(x.nav||0)+3000000}:x); return [p,st,a2,d,e,l]; }},
  { id:"s_florida", label:"Move to Florida", desc:"0% state income tax",
    apply:(p,st,a,d,e,l) => [{ ...p, state:"FL", stateRate:0 },st,a,d,e,l] },
  { id:"s_repro", label:"RE Professional", desc:"Spouse qualifies - rental losses offset ordinary",
    apply:(p,st,a,d,e,l) => [{ ...p, reProStatus:true },st,a,d,e,l] },
  { id:"s_no_pte", label:"No PTET", desc:"Disable PTE election - see SALT workaround value",
    apply:(p,st,a,d,e,l) => { const e2=e.map(x=>x.pteElection?{...x,pteElection:false}:x); return [p,st,a,d,e2,l]; }},
];

function ScenariosTab({ profile, streams, assets, deductions, entities, liabilities, result }) {
  const [active, setActive] = useState(["s_flex_2m","s_flex_upgrade","s_delphi_up"]);
  const toggle = (id) => setActive(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const scenarios = useMemo(() => {
    return active.map(id => {
      const preset = SCENARIO_PRESETS.find(p=>p.id===id);
      if (!preset) return null;
      const [p2,st2,a2,d2,e2,l2] = preset.apply(profile,streams,assets,deductions,entities,liabilities);
      const r = computeTax(p2,st2,a2,d2,e2,l2);
      return { ...preset, result:r, delta:r.totalTax - result.totalTax };
    }).filter(Boolean);
  }, [active, profile, streams, assets, deductions, entities, liabilities, result]);

  const metrics = [
    {l:"AGI", f:r=>r.agi},
    {l:"Ordinary", f:r=>r.totalOrdinary},
    {l:"Pref.", f:r=>r.totalPref},
    {l:"Fed Tax", f:r=>r.federalTax},
    {l:"State Tax", f:r=>r.stateTaxAfterPTE},
    {l:"NIIT", f:r=>r.niit},
    {l:"Total Tax", f:r=>r.totalTax},
    {l:"Eff. Rate", f:r=>r.effectiveRate, pct:true},
    {l:"PTET", f:r=>r.totalPTET},
    {l:"Susp. PAL", f:r=>r.suspendedPAL},
    {l:"Net Cash", f:r=>r.netCashAfterTax},
  ];

  return <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <SectionHeader sub="Toggle scenarios to compare against your base case">{"Scenario Analysis"}</SectionHeader>
    {/* Toggle buttons */}
    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
      {SCENARIO_PRESETS.map(p => {
        const on = active.includes(p.id);
        return <button key={p.id} onClick={() => toggle(p.id)} style={{
          padding:"8px 14px", borderRadius:4, fontSize:11, cursor:"pointer", fontFamily:"inherit",
          background:on?C.accent+"18":"none", border:`1px solid ${on?C.accent:C.border}`, color:on?C.accent:C.textMuted,
        }}><div style={{ fontWeight:500 }}>{p.label}</div>
          <div style={{ fontSize:9, color:C.textMuted, marginTop:2 }}>{p.desc}</div>
        </button>;
      })}
    </div>
    {/* Comparison table */}
    {scenarios.length > 0 && <Card style={{ padding:"16px 20px", overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
        <thead>
          <tr style={{ borderBottom:`2px solid ${C.border}` }}>
            <th style={{ textAlign:"left", padding:"8px 6px", fontSize:9, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:400 }}>Metric</th>
            <th style={{ textAlign:"right", padding:"8px 6px", fontSize:9, color:C.accent, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:500 }}>Base Case</th>
            {scenarios.map(s => <th key={s.id} style={{ textAlign:"right", padding:"8px 6px", fontSize:9, color:C.textMuted, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:400 }}>{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m,i) => (
            <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.surface2:"transparent" }}>
              <td style={{ padding:"6px", color:C.text, fontSize:11 }}>{m.l}</td>
              <td style={{ padding:"6px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", color:C.accent, fontWeight:500 }}>
                {m.pct ? pct(m.f(result)) : fmtD(m.f(result), true)}
              </td>
              {scenarios.map(s => {
                const base = m.f(result);
                const sc = m.f(s.result);
                const d = sc - base;
                return <td key={s.id} style={{ padding:"6px", textAlign:"right" }}>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", color:C.text }}>{m.pct ? pct(sc) : fmtD(sc, true)}</div>
                  {Math.abs(d) > (m.pct ? 0.05 : 50) && <div style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace",
                    color:m.l.includes("Tax")||m.l==="NIIT"||m.l==="Eff. Rate"||m.l==="Susp. PAL" ? (d<0?C.green:C.red) : (d>0?C.green:C.red) }}>
                    {d>0?"+":""}{m.pct ? pct(d) : fmtD(d, true)}
                  </div>}
                </td>;
              })}
            </tr>
          ))}
          {/* Total tax delta summary row */}
          <tr style={{ borderTop:`2px solid ${C.border}`, background:C.accent+"08" }}>
            <td style={{ padding:"8px 6px", fontSize:12, color:C.text, fontWeight:500 }}>{"Tax Delta vs. Base"}</td>
            <td style={{ padding:"8px 6px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", color:C.accent }}>{"--"}</td>
            {scenarios.map(s => (
              <td key={s.id} style={{ padding:"8px 6px", textAlign:"right", fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600,
                color:s.delta<0?C.green:s.delta>0?C.red:C.textDim }}>
                {s.delta>0?"+":""}{fmtD(s.delta, true)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Card>}
    {scenarios.length === 0 && <Card style={{ padding:40, textAlign:"center" }}>
      <div style={{ fontSize:13, color:C.textMuted }}>{"Toggle scenarios above to see comparison analysis."}</div>
    </Card>}
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
  const withheldStreams = streams.filter(s => (s.fedWithholdingPct||0)>0 || (s.stateWithholdingPct||0)>0);

  const fedOwes = result.balanceDueFed > 0;
  const stOwes = result.balanceDueState > 0;
  const wfRow = (l,v,c,opts={}) => <div style={{ display:"flex", justifyContent:"space-between", padding:opts.bold?"8px 0":"5px 0",
    ...(opts.top ? {borderTop:`1px solid ${C.border}`, marginTop:6, paddingTop:8} : {}) }}>
    <span style={{ fontSize:opts.bold?12:11, color:opts.bold?C.text:C.textDim }}>{l}</span>
    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:opts.bold?14:12, color:c }}>{fmtD(v, true)}</span>
  </div>;

  return <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
    <SectionHeader sub="Tax liability, payments, and estimated tax optimization">{"Tax Payment Optimizer"}</SectionHeader>

    {/* Outcome cards */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <Card style={{ padding:"20px 24px", borderColor:fedOwes?C.red+"40":C.green+"40" }}>
        <div style={{ fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"Federal"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:28, color:fedOwes?C.red:C.green, fontWeight:500 }}>
          {fmtD(fedOwes ? result.balanceDueFed : result.overpaymentFed, true)}
        </div>
        <div style={{ fontSize:11, color:fedOwes?C.red:C.green, marginTop:2 }}>{fedOwes ? "Balance due" : "Refund"}</div>
      </Card>
      <Card style={{ padding:"20px 24px", borderColor:stOwes?C.red+"40":C.green+"40" }}>
        <div style={{ fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"State (" + (profile.state||"") + ")"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:28, color:stOwes?C.red:C.green, fontWeight:500 }}>
          {fmtD(stOwes ? result.balanceDueState : result.overpaymentState, true)}
        </div>
        <div style={{ fontSize:11, color:stOwes?C.red:C.green, marginTop:2 }}>{stOwes ? "Balance due" : "Refund"}</div>
      </Card>
    </div>

    {/* Waterfalls side by side */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      {/* Federal waterfall */}
      <Card style={{ padding:"18px 22px" }}>
        <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>{"Federal waterfall"}</div>
        {wfRow("Tax liability", result.federalTax, C.red)}
        {result.totalFedWithholding > 0 && wfRow("Withholding", -result.totalFedWithholding, C.green)}
        {result.totalEstPaid > 0 && wfRow("Estimated payments", -result.totalEstPaid, C.green)}
        {wfRow(fedOwes ? "Balance due" : "Refund", fedOwes ? result.balanceDueFed : result.overpaymentFed, fedOwes ? C.red : C.green, {bold:true, top:true})}
      </Card>
      {/* State waterfall */}
      <Card style={{ padding:"18px 22px" }}>
        <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>{"State waterfall (" + (profile.state||"") + ")"}</div>
        {wfRow("Gross state tax", result.stateTax, C.red)}
        {result.totalPTET > 0 && wfRow("PTE credit", -result.totalPTET, C.green)}
        <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:6 }}>
          <span style={{ fontSize:11, color:C.textDim }}>{"Net state liability"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:result.stateTaxAfterPTE>0?C.text:C.green }}>{fmtD(result.stateTaxAfterPTE, true)}</span>
        </div>
        {result.totalStateWithholding > 0 && wfRow("State withholding", -result.totalStateWithholding, C.green)}
        {wfRow(stOwes ? "Balance due" : "Refund", stOwes ? result.balanceDueState : result.overpaymentState, stOwes ? C.red : C.green, {bold:true, top:true})}
        {result.overpaymentState > 0 && <div style={{ fontSize:10, color:C.green, marginTop:6 }}>
          {"PTE credit exceeds state liability. Consider reducing state estimated payments."}
        </div>}
      </Card>
    </div>

    {/* Entity-Level Deductions */}
    {(result.totalPTET > 0 || result.totalRetirement > 0 || result.totalHealthIns > 0) && <Card style={{ padding:"16px 20px" }}>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>{"Entity-level pre-tax deductions"}</div>
      {result.pteDetails.map((d,i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
          <span style={{ fontSize:11, color:C.textDim }}>{"PTE ("}{d.entity}{" - "}{d.rate}{"% "}{d.state}{")"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.accent }}>{fmtD(d.amount, true)}</span>
        </div>
      ))}
      {result.totalRetirement > 0 && <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
        <span style={{ fontSize:11, color:C.textDim }}>{"Retirement (401k + PS + DB)"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.blue }}>{fmtD(result.totalRetirement, true)}</span>
      </div>}
      {result.totalHealthIns > 0 && <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
        <span style={{ fontSize:11, color:C.textDim }}>{"Self-employed health insurance"}</span>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:C.teal }}>{fmtD(result.totalHealthIns, true)}</span>
      </div>}
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:6, marginTop:4 }}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:12, color:C.text }}>{"Total pre-tax deductions"}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:C.accent }}>{fmtD(result.preTaxDeductions + result.totalHealthIns, true)}</span>
        </div>
        {result.pteFedSavings > 0 && <div style={{ fontSize:10, color:C.green, marginTop:4 }}>
          {"SALT workaround saves ~"}{fmtD(result.pteFedSavings, true)}{" in federal tax by bypassing the $10K SALT cap."}
        </div>}
      </div>
    </Card>}

    {/* Withholding Sources */}
    {withheldStreams.length > 0 && <Card style={{ padding:"16px 20px" }}>
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>{"Withholding sources"}</div>
      {withheldStreams.map(s => {
        const fedW = (s.amount||0)*(s.fedWithholdingPct||0)/100;
        const stW = (s.amount||0)*(s.stateWithholdingPct||0)/100;
        return <div key={s.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.text }}>{s.label}</div>
            <div style={{ fontSize:10, color:C.textMuted }}>{fmtD(s.amount,true)} gross</div>
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
        <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"110% prior year"}</div>
        <div style={{ fontFamily:"'Erode',Georgia,serif", fontSize:22, color:C.text }}>{fmtD(result.safeHarborPY, true)}</div>
      </Card>
      <Card style={{ padding:"16px 18px" }}>
        <div style={{ fontSize:8, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textMuted, marginBottom:6 }}>{"90% current year"}</div>
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
      <div style={{ fontSize:10, color:C.accent, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>{"Quarterly estimated payments (1040-ES)"}</div>
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
  livingExpenses: 28000, reProStatus: false,
};

const PRELOAD_STREAMS = [
  { id:"s1", type:"business", label:"K-1 Ordinary - Quarterly Distribution (incl. draw)", amount:2500000, timing:"quarterly", entity:"Husband", qbi:false,
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
  {id:"a8",assetType:"realEstate",label:"Pacific Heights Duplex",value:3500000,costBasis:2200000,netCashFlow:72000,taxableIncome:-15000,entity:"Test RE Holdings LLC"},
  // Retirement (Tier R)
  {id:"a9",assetType:"retirement",label:"Husband 401(k) / Profit-Sharing",value:1200000,entity:"Husband"},
  {id:"a10",assetType:"retirement",label:"Wife IRA (Rollover)",value:380000,entity:"Wife"},
];

const PRELOAD_DEDUCTIONS = [
  { id: "d1", type: "salt", amount: 10000, label: "SALT (CA - capped)" },
  { id: "d3", type: "charitable", amount: 40000, label: "Annual Charitable (DAF + Direct)" },
];

const PRELOAD_ENTITIES = [
  { id:"e1", label:"Husband", type:"individual", filing:"1040 (MFJ)", color:C.gold, ownedBy:"", ownershipPct:100,
    notes:"Partner, BigLaw Test LLP - San Francisco office",
    pteElection:true, pteRate:9.3, pteState:"CA",
    retirementContrib:138000, healthInsurance:47000,
    // Approach C: actual distributions received (draws + advances + true-up)
    actualDistributions:1500000, distributionMonths:[2,5,8,11],
  },
  { id:"e2", label:"Wife", type:"individual", filing:"1040 (MFJ)", color:C.blue, ownedBy:"", ownershipPct:100,
    notes:"Spouse",
    pteElection:false, pteRate:0, retirementContrib:0, healthInsurance:0,
  },
  { id:"e3", label:"Test Family Trust", type:"revTrust", filing:"Grantor -> 1040", color:C.purple, ownedBy:"", ownershipPct:100,
    notes:"Joint revocable trust - holds PE + Delphi Plus allocations",
    pteElection:false, pteRate:0, retirementContrib:0, healthInsurance:0,
  },
  { id:"e4", label:"Test RE Holdings LLC", type:"llcDisregard", filing:"Sch E -> 1040", color:C.teal, ownedBy:"e3", ownershipPct:100,
    notes:"Holds Pacific Heights duplex - disregarded entity",
    pteElection:false, pteRate:0, retirementContrib:0, healthInsurance:0,
  },
];

const PRELOAD_LIABILITIES = [
  { id:"l1", label:"Primary Residence Mortgage", balance:1400000, monthlyPayment:8200, annualInterest:72000,
    deductType:"schedA", assetId:"a8", startMonth:0, endMonth:11 },
  { id:"l2", label:"Schwab SBLOC", balance:0, monthlyPayment:0, annualInterest:0,
    deductType:"investment", assetId:"", startMonth:0, endMonth:11 },
];

// --- PERSONA PRESETS ────────────────────────────────────────────────────────
const PERSONA_PRESETS = [
  {
    label: "BigLaw Partner", desc: "Senior partner at Am Law 100 firm",
    profile: { filingStatus: "mfj", state: "NY", stateRate: 10.9, livingExpenses: 25000 },
    streams: [
      { type: "business", label: "Guaranteed Payment — Partner Draw", amount: 1200000, timing: "monthly", entity: "Firm LLP", qbi: false },
      { type: "business", label: "K-1 Ordinary — Firm Profit Allocation", amount: 800000, timing: "annual", timingMonth: 2, entity: "Firm LLP", qbi: true },
      { type: "ltcg", label: "K-1 LTCG — Firm Investment Gains", amount: 150000, timing: "annual", timingMonth: 2, entity: "Firm LLP", qbi: false },
    ],
  },
  {
    label: "PE Fund GP", desc: "General Partner at mid-market PE firm",
    profile: { filingStatus: "mfj", state: "NY", stateRate: 10.9, livingExpenses: 35000 },
    streams: [
      { type: "wages", label: "W-2 Salary — Management Company", amount: 400000, timing: "monthly", entity: "Fund Mgmt Co", qbi: false },
      { type: "business", label: "GP Mgmt Fee Share", amount: 600000, timing: "quarterly", entity: "Fund GP LLC", qbi: false },
      { type: "ltcg", label: "Carried Interest — Fund III", amount: 2000000, timing: "annual", timingMonth: 2, entity: "Fund III GP LLC", qbi: false },
      { type: "business", label: "Monitoring Fee Income", amount: 200000, timing: "semi", entity: "Fund III GP LLC", qbi: false },
    ],
  },
  {
    label: "HF Portfolio Manager", desc: "Senior PM at multi-strat hedge fund",
    profile: { filingStatus: "mfj", state: "CT", stateRate: 6.99, livingExpenses: 30000 },
    streams: [
      { type: "wages", label: "W-2 Base + Guaranteed Comp", amount: 500000, timing: "monthly", entity: "Fund Management LLC", qbi: false },
      { type: "business", label: "K-1 Ordinary — Fund P&L Allocation", amount: 1500000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
      { type: "stcg", label: "K-1 STCG — Trading Gains", amount: 800000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
      { type: "ltcg", label: "K-1 LTCG — Longer-Dated Positions", amount: 400000, timing: "annual", timingMonth: 2, entity: "Fund LP", qbi: false },
    ],
  },
  {
    label: "Real Estate Family", desc: "Multi-property rental portfolio",
    profile: { filingStatus: "mfj", state: "FL", stateRate: 0, livingExpenses: 20000 },
    streams: [
      { type: "passive", label: "Rental Net — Portfolio (8 units)", amount: 320000, timing: "monthly", entity: "RE Holdings LLC", qbi: true },
      { type: "business", label: "Sec. 1250 Recapture — Property Sale", amount: 180000, timing: "annual", timingMonth: 5, entity: "RE Holdings LLC", qbi: false },
      { type: "interest", label: "Money Market / T-Bills", amount: 120000, timing: "monthly", entity: "Direct", qbi: false },
      { type: "qualDiv", label: "REIT Qualified Dividends", amount: 45000, timing: "quarterly", entity: "Brokerage", qbi: false },
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
  const [liabilities, setLiabs] = useState(PRELOAD_LIABILITIES);
  const [panel, setPanel] = useState(null);

  const updProfile = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const result = useMemo(() => computeTax(profile, streams, assets, deductions, entities, liabilities), [profile, streams, assets, deductions, entities, liabilities]);
  const bs = useMemo(() => computeBalanceSheet(assets, liabilities), [assets, liabilities]);

  const saveStream = (s) => { setStreams(p => p.find(x => x.id === s.id) ? p.map(x => x.id === s.id ? s : x) : [...p, s]); setPanel(null); };
  const delStream = (id) => { setStreams(p => p.filter(x => x.id !== id)); setPanel(null); };
  const saveAsset = (a) => { setAssets(p => p.find(x => x.id === a.id) ? p.map(x => x.id === a.id ? a : x) : [...p, a]); setPanel(null); };
  const delAsset = (id) => { setAssets(p => p.filter(x => x.id !== id)); setPanel(null); };

  const applyPersona = (persona) => {
    if (persona.profile) Object.entries(persona.profile).forEach(([k, v]) => updProfile(k, v));
    setStreams(prev => [...prev, ...persona.streams.map(s => ({ ...s, id: uid() }))]);
  };
  const resetAll = () => { setProfile(PRELOAD_PROFILE); setStreams(PRELOAD_STREAMS); setAssets(PRELOAD_ASSETS); setDeds(PRELOAD_DEDUCTIONS); setEntities(PRELOAD_ENTITIES); setLiabs(PRELOAD_LIABILITIES); };
  const clearAll = () => { setProfile(DEFAULT_PROFILE); setStreams([]); setAssets([]); setDeds([]); setEntities([]); setLiabs([]); };

  return <div style={{ background: C.bg, height: "100vh", overflow: "hidden", fontFamily: "'Inter',system-ui,sans-serif", color: C.text, display: "flex" }}>
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
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.navBorder}` }}>
        <div style={{ fontFamily: "'Erode',Georgia,serif", fontSize: 18, color: "#FFFFFF", letterSpacing: "0.04em" }}>Yosemite</div>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.navAccent, marginTop: 2 }}>{"v2 beta-C"}</div>
      </div>
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.navBorder}` }}>
        <input value={profile.name} onChange={e => updProfile("name", e.target.value)} placeholder="Client / Household Name"
          style={{ width: "100%", background: "none", border: "none", fontSize: 12, color: "#FFFFFF", outline: "none" }} />
        <div style={{ fontSize: 10, color: C.navText, marginTop: 3 }}>{profile.filingStatus.toUpperCase()} {"| "}{STATE_RATES[profile.state]?.label || profile.state}{" | 2025"}</div>
      </div>
      {/* Live estimate - above nav */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.navBorder}` }}>
        {[
          { l: "Net Worth", v: fmtD(bs.netWorth, true), c: C.gold },
          { l: "AGI", v: fmtD(result.agi, true) },
          { l: "Total Tax", v: fmtD(result.totalTax, true), c: "#E07060" },
          { l: "Eff. Rate", v: pct(result.effectiveRate) },
          { l: "Net Cash", v: fmtD(result.netCashAfterTax, true), c: result.netCashAfterTax >= 0 ? "#5EAA82" : "#E07060" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}>
            <span style={{ color: C.navText }}>{r.l}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: r.c || "#A0B0C0" }}>{r.v}</span>
          </div>
        ))}
      </div>
      {/* Nav tabs */}
      <nav style={{ flex: 1, padding: "6px 0", overflow: "auto", minHeight: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 16px",
              background: tab === t.id ? C.navActive : "none",
              border: "none", borderLeft: `2px solid ${tab === t.id ? C.navAccent : "transparent"}`,
              color: tab === t.id ? "#FFFFFF" : C.navText, cursor: "pointer", fontSize: 12,
              fontFamily: "inherit",
            }}>
            <span style={{ fontSize: 12, color: tab === t.id ? C.navAccent : C.navText, width: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {/* Actions + collapsible presets */}
      <div style={{ padding: "8px 16px 10px", borderTop: `1px solid ${C.navBorder}`, flexShrink: 0 }}>
        <button onClick={() => generateReport(profile, result, bs, streams, assets, entities, liabilities)}
          style={{ display: "block", width: "100%", textAlign: "left", background: C.navActive, border: `1px solid ${C.navBorder}`, borderRadius: 3,
            padding: "5px 8px", color: "#FFFFFF", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginBottom: 4 }}>
          {"Generate Report"}
        </button>
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <button onClick={resetAll}
            style={{ flex: 1, textAlign: "center", background: C.navAccent + "18", border: `1px solid ${C.navAccent}30`, borderRadius: 3,
              padding: "4px 6px", color: C.navAccent, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {"Reset"}
          </button>
          <button onClick={clearAll}
            style={{ flex: 1, textAlign: "center", background: "none", border: `1px solid ${C.navBorder}`, borderRadius: 3,
              padding: "4px 6px", color: C.navText, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {"Clear"}
          </button>
        </div>
        <details style={{ fontSize: 10 }}>
          <summary style={{ color: C.navText, cursor: "pointer", padding: "4px 0", userSelect: "none" }}>{"Presets"}</summary>
          <div style={{ paddingTop: 4 }}>
            {PERSONA_PRESETS.map((p, i) => (
              <button key={i} onClick={() => applyPersona(p)}
                style={{
                  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                  padding: "4px 4px", color: C.navText, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                  borderRadius: 3,
                }}
                onMouseOver={e => e.target.style.color = C.navAccent}
                onMouseOut={e => e.target.style.color = C.navText}>
                {p.label}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>

    {/* Main Content */}
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
      {tab === "overview" && <OverviewTab profile={profile} result={result} streams={streams} assets={assets} updProfile={updProfile} bs={bs} />}
      {tab === "balsheet" && <BalanceSheetTab assets={assets} bs={bs} onEdit={a => setPanel({type:"asset",data:a})} onAdd={() => setPanel({type:"asset",data:null})} onDelete={delAsset} />}
      {tab === "income" && <IncomeTab streams={streams} assets={assets} onEdit={s => setPanel({ type: "income", data: s })} onAdd={() => setPanel({ type: "income", data: null })} onDelete={delStream} />}
      {tab === "deductions" && <DeductionsTab deductions={deductions} setDeductions={setDeds} profile={profile} updProfile={updProfile} result={result} liabilities={liabilities} setLiabs={setLiabs} />}
      {tab === "cashflow" && <CashFlowTab profile={profile} streams={streams} assets={assets} result={result} liabilities={liabilities} entities={entities} />}
      {tab === "scenarios" && <ScenariosTab profile={profile} streams={streams} assets={assets} deductions={deductions} entities={entities} liabilities={liabilities} result={result} />}
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
