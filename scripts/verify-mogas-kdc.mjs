#!/usr/bin/env node
/**
 * Verify Mogas MOC calculations against KDC
 * Usage: node scripts/verify-mogas-kdc.mjs [YYYY-MM-DD]
 */

import { readFileSync } from 'fs';

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const creds = JSON.parse(readFileSync('.config/spglobal/credentials.json', 'utf8'));

async function searchKDC(targetDate) {
  const url = 'https://api.platts.com/news-insights/v1/search/story?' +
    'q=Singapore%20gasoline%20daily%20structure&pageSize=20';
  
  const res = await fetch(url, {
    headers: { 
      'Authorization': `Bearer ${creds.access_token}`,
      'appkey': 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN'
    }
  });
  const data = await res.json();
  
  const items = (data.results || []).filter(r => {
    const d = r.createdDate || r.updatedDate || '';
    return d.startsWith(targetDate);
  });
  
  return items[0] || null;
}

async function getKDCContent(articleId) {
  const url = `https://api.platts.com/news-insights/v1/content/${articleId}`;
  
  const res = await fetch(url, {
    headers: { 
      'Authorization': `Bearer ${creds.access_token}`,
      'appkey': 'mXrBlqeKBqbHpYNMX96h9qN0D8H5o3AN'
    }
  });
  const data = await res.json();
  const body = data?.envelope?.content?.body || '';
  const text = body.replace(/<[^>]+>/g, '').trim();
  
  // Extract values
  const aprilMatch = text.match(/April at \$([0-9.]+)\/b/);
  const mayMatch = text.match(/May at \$([0-9.]+)\/b/);
  const spreadMatch = text.match(/April\/May at \$([0-9.]+)\/b/);
  const stripMatch = text.match(/MOPS_Strip.*\$([0-9.]+)\/b/);
  
  return {
    april: aprilMatch ? parseFloat(aprilMatch[1]) : null,
    may: mayMatch ? parseFloat(mayMatch[1]) : null,
    spread: spreadMatch ? parseFloat(spreadMatch[1]) : null,
    strip: stripMatch ? parseFloat(stripMatch[1]) : null,
    text
  };
}

async function main() {
  console.log(`\n=== KDC Verification for ${date} ===\n`);
  
  const kdc = await searchKDC(date);
  
  if (!kdc) {
    console.log(`❌ No KDC found for ${date}`);
    console.log('KDC通常在09:30-10:30 UTC发布（17:30-18:30 SGT）');
    return;
  }
  
  const time = (kdc.createdDate || kdc.updatedDate || '').slice(11, 19);
  console.log(`✓ Found KDC (${time} UTC)`);
  console.log(`  Title: ${kdc.headline || kdc.title}`);
  console.log(`  ID: ${kdc.articleId || kdc.id}\n`);
  
  const content = await getKDCContent(kdc.articleId || kdc.id);
  
  console.log('KDC Values:');
  console.log(`  April:  $${content.april?.toFixed(2) || 'N/A'}/bbl`);
  console.log(`  May:    $${content.may?.toFixed(2) || 'N/A'}/bbl`);
  console.log(`  Spread: $${content.spread?.toFixed(2) || 'N/A'}/bbl`);
  console.log(`  Strip:  $${content.strip?.toFixed(2) || 'N/A'}/bbl`);
  
  // Load our calculations if available
  const reportPath = `reports/moc-daily/${date}.json`;
  let ourData = null;
  try {
    ourData = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (e) {
    // No saved report
  }
  
  if (ourData && ourData.m1SwapVwap) {
    console.log('\nOur Calculations:');
    console.log(`  M1 VWAP: $${parseFloat(ourData.m1SwapVwap).toFixed(2)}/bbl`);
    console.log(`  Strip:   $${parseFloat(ourData.assessment92).toFixed(2)}/bbl`);
    
    const vwapDiff = parseFloat(ourData.m1SwapVwap) - content.april;
    const stripDiff = parseFloat(ourData.assessment92) - content.strip;
    
    console.log('\nDeviation:');
    console.log(`  M1:    ${vwapDiff >= 0 ? '+' : ''}$${vwapDiff.toFixed(2)} ${Math.abs(vwapDiff) <= 0.10 ? '✅' : '⚠️'}`);
    console.log(`  Strip: ${stripDiff >= 0 ? '+' : ''}$${stripDiff.toFixed(2)} ${Math.abs(stripDiff) <= 0.15 ? '✅' : '⚠️'}`);
    
    if (Math.abs(vwapDiff) > 0.20 || Math.abs(stripDiff) > 0.30) {
      console.log('\n⚠️  Large deviation detected! Review calculation method.');
    }
  } else {
    console.log('\n(No saved report for comparison)');
  }
  
  console.log('\n' + '='.repeat(60));
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
