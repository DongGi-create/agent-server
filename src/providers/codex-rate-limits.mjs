// Only explicit usage/rate-limit errors are retryable; a generic 429 may be billing.
export function isRateLimitError(error) {
  const details=JSON.stringify(error?.data||error||{});
  const text=String(error?.message||'')+' '+details;
  if(/insufficient_quota|billing_hard_limit|invalid_api_key|unauthorized|payment required|credits_depleted|spend.?control/i.test(text)) return false;
  return /usage[_-]?limit[_-]?exceeded|rate[_-]?limit[_-]?(?:exceeded|reached)|(?:hit|reached|exceeded) your usage limit|rate limit exceeded|too many requests/i.test(text);
}

export function limitState(result,now=Date.now()) {
  // A missing/invalid snapshot must never be interpreted as available capacity.
  const group=result?.rateLimits||result?.rateLimitsByLimitId?.codex;
  const windows=[group?.primary,group?.secondary].filter(b=>b&&typeof b.usedPercent==='number'&&Number.isFinite(b.usedPercent));
  const known=windows.length>0||result?.ordinaryUsageAllowed===true;
  const exhausted=windows.filter(b=>b.usedPercent>=100);
  const blocked=!known||result?.ordinaryUsageAllowed===false||group?.spendControlReached===true||!!group?.rateLimitReachedType||exhausted.length>0;
  const resets=exhausted.map(b=>Number(b.resetsAt)).map(v=>v<1e12?v*1000:v).filter(v=>Number.isFinite(v)&&v>now);
  // Both windows must have capacity; use the latest exhausted window's reset.
  const retryAt=resets.length===exhausted.length&&resets.length?Math.max(...resets)+5000:now+300000;
  return {known,blocked,retryAt};
}
