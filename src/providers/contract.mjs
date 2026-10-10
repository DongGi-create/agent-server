const required=['start','stop','models','usage','readSession','openSession','startTurn','steer','interrupt','prepareInput','classifyTask','answerApproval','rejectApproval','isRateLimitError','on'];

export function assertProvider(provider){
  if(!provider||typeof provider.id!=='string'||!provider.id.trim())throw new Error('Provider must have an id.');
  for(const method of required)if(typeof provider[method]!=='function')throw new Error(`Provider ${provider.id} is missing ${method}().`);
  return provider;
}
